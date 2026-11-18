/** Signed artifact controls for the actual AppImage Setup dialog and RuntimeManager. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { lstat, readFile, readdir, readlink, realpath, statfs, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import {
  cancelRuntimeSetupTransfer,
  confirmRuntimeSetupReview,
  dismissRuntimeSetupReview,
  getRuntimeSetupProgress,
  getRuntimeSetupStatus,
  openRuntimeSetupReview,
  waitForRuntimeSetupCancelled,
  waitForRuntimeSetupError,
  waitForRuntimeSetupProgress,
} from './packaged-runtime-setup-ui.mjs'

const archiveBytes = 3_218_614_866
const lamaBytes = 205_669_692
const runtimeFloor = 20 * 1024 ** 3
const cancelPrefixBytes = 1024 ** 2
const appVersion = 'qualification-0.1.0'
const genericFailure =
  'Image setup could not be completed. Check runtime status before trying again.'
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function waitClosed(requests) {
  let timeout
  try {
    await Promise.race([
      Promise.all(requests),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Qualification artifact response did not close.')),
          10_000,
        )
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

function stream(filename, options = {}) {
  return createReadStream(filename, { flags: fileFlags, ...options })
}

async function hashFile(filename) {
  const digest = createHash('sha256')
  for await (const bytes of stream(filename)) digest.update(bytes)
  return digest.digest('hex')
}

async function absence(filename) {
  await assert.rejects(lstat(filename), { code: 'ENOENT' })
}

async function freeSpace(directory) {
  const volume = await statfs(directory, { bigint: true })
  return Number(volume.bavail * volume.bsize)
}

async function absentSlots(runtime) {
  for (const name of [
    'current-runtime.json',
    '.igs-runtime-install.claim.json',
    '.igs-runtime-install-recovery.claim.json',
  ]) {
    await absence(path.join(runtime, name))
  }
  for (const name of ['environments', 'python']) {
    assert.deepEqual(await readdir(path.join(runtime, name)), [])
  }
}

function expectedReview(transport) {
  assert.equal(transport.appVersion, appVersion)
  assert.equal(typeof transport.releaseId, 'string')
  return {
    releaseId: transport.releaseId,
    downloadBytes: archiveBytes + lamaBytes,
    runtimeRequiredFreeBytes: runtimeFloor,
    runtimeCached: false,
    outpaintInfillReused: false,
  }
}

async function signedManifest(pin) {
  const before = await lstat(pin.path)
  assert.ok(before.isFile() && before.size === pin.sizeBytes && before.size <= 1024 ** 2)
  assert.equal(await realpath(pin.path), pin.path)
  const contents = await readFile(pin.path)
  assert.equal(sha(contents), pin.sha256)
  const { payload } = JSON.parse(contents.toString('utf8'))
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
}

async function assertIncomplete(cache) {
  assert.deepEqual((await readdir(cache)).sort(), ['.incomplete', 'transport'])
  assert.deepEqual(await readdir(path.join(cache, 'transport')), [])
  const marker = path.join(cache, '.incomplete')
  assert.equal(await readFile(marker, 'utf8'), 'Runtime transport operation is incomplete.\n')
}

async function verifyExpanded(root, manifest) {
  const entries = new Map(manifest.files.map((file) => [file.path, file]))
  const found = new Set()
  let regularBytes = 0
  async function visit(directory, relative = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name)
      const name = relative ? `${relative}/${item.name}` : item.name
      if (item.isDirectory()) {
        await visit(filename, name)
        continue
      }
      const expected = entries.get(name)
      assert.ok(expected && !found.has(name), name)
      found.add(name)
      if (expected.kind === 'symlink') {
        assert.ok(item.isSymbolicLink(), name)
        assert.equal(await readlink(filename), expected.target, name)
        continue
      }
      assert.equal(expected.kind, 'file', name)
      const info = await lstat(filename)
      assert.ok(info.isFile() && info.nlink === 1, name)
      assert.equal(info.mode & 0o777, expected.executable ? 0o700 : 0o600, name)
      assert.equal(info.size, expected.sizeBytes, name)
      assert.equal(await hashFile(filename), expected.sha256, name)
      regularBytes += info.size
    }
  }
  await visit(root)
  assert.deepEqual(found, new Set(entries.keys()))
  return { entries: found.size, regularBytes }
}

/** This transport exists only in the isolated harness. No public endpoint or redirected URL. */
export async function preparePackagedRuntimeSetupControl({ root, mode, inputs }) {
  assert.ok(['incompatible', 'cancel', 'corrupt', 'disk'].includes(mode), mode)
  const runs = path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/packaged-runtime-setup',
  )
  assert.ok(root.startsWith(`${runs}/`) && path.resolve(root) === root)
  assert.equal(await realpath(root), root)
  assert.equal((await lstat(root)).uid, process.getuid())
  const dataRoot = path.join(root, 'data/imagegen-studio')
  await absence(dataRoot)
  const runtime = path.join(dataRoot, 'runtime')
  const downloads = path.join(dataRoot, 'cache/runtime-downloads')
  const cache = path.join(downloads, 'qualification-runtime-transport')
  const journal = path.join(runtime, 'runtime-installation.json')
  const lama = path.join(dataRoot, 'inference-resources/big-lama.pt')
  const config = path.join(root, 'setup-config.json')
  const [transport, manifest] = await Promise.all([
    signedManifest(inputs.transportEnvelope),
    signedManifest(inputs.runtimeEnvelope),
  ])
  assert.equal(inputs.archive.sizeBytes, archiveBytes)
  assert.equal(inputs.lama.sizeBytes, lamaBytes)
  assert.equal(transport.artifact.sizeBytes, archiveBytes)
  assert.equal(transport.artifact.sha256, inputs.archive.sha256)
  assert.equal(transport.runtimeEnvelopeSha256, inputs.runtimeEnvelope.sha256)
  assert.equal(transport.entryCount, manifest.files.length)
  assert.equal(manifest.requiredFreeBytes, runtimeFloor)

  const expectedRoutes =
    mode === 'incompatible'
      ? []
      : mode === 'disk'
        ? ['/runtime.zip', '/big-lama.pt']
        : ['/runtime.zip']
  const sources = new Map([
    ['/runtime.zip', inputs.archive],
    ['/big-lama.pt', inputs.lama],
  ])
  const requests = []
  const tasks = []
  const closes = []
  const server = http.createServer((request, response) => {
    const supported = request.method === 'GET' && request.url === expectedRoutes[requests.length]
    const entry = {
      method: request.method,
      route: request.url,
      range: request.headers.range ?? null,
      sentBytes: 0,
      responseSha256: null,
      finished: false,
      closed: false,
      failure: null,
    }
    requests.push(entry)
    response.once('finish', () => {
      entry.finished = true
    })
    closes.push(
      new Promise((resolve) =>
        response.once('close', () => {
          entry.closed = true
          resolve()
        }),
      ),
    )
    const serve = async () => {
      assert.ok(supported && entry.range === null, 'Unexpected qualification artifact request.')
      const source = sources.get(request.url)
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': source.sizeBytes,
      })
      const digest = createHash('sha256')
      if (mode === 'cancel') {
        for await (const bytes of stream(source.path, { end: cancelPrefixBytes - 1 })) {
          if (response.destroyed) break
          entry.sentBytes += bytes.length
          digest.update(bytes)
          response.write(bytes)
        }
        entry.responseSha256 = digest.digest('hex')
        return
      }
      const corrupt = mode === 'corrupt'
      async function* body() {
        for await (const bytes of stream(source.path)) {
          if (corrupt && entry.sentBytes === 0) bytes[0] ^= 1
          entry.sentBytes += bytes.length
          digest.update(bytes)
          yield bytes
        }
      }
      await pipeline(body(), response)
      entry.responseSha256 = digest.digest('hex')
    }
    tasks.push(
      serve().catch((error) => {
        entry.failure = error.message
        response.destroy()
      }),
    )
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address()?.port
  assert.ok(Number.isInteger(port) && port > 0)

  let stopped
  const stop = () =>
    (stopped ??= (async () => {
      const closed = new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
      await closed
      await waitClosed([...tasks, ...closes])
      await writeFile(
        path.join(root, 'setup-control-transfer.json'),
        JSON.stringify({ mode, requests }, null, 2) + '\n',
        {
          flag: 'wx',
          mode: 0o600,
        },
      )
    })())
  try {
    const metadataPin = ({ path, sha256 }) => ({ path, sha256 })
    await writeFile(
      config,
      JSON.stringify(
        {
          schemaVersion: 1,
          appVersion,
          port,
          runtimeEnvelope: metadataPin(inputs.runtimeEnvelope),
          transportEnvelope: metadataPin(inputs.transportEnvelope),
          trustedKeys: metadataPin(inputs.trustedKeys),
          unsupportedDriverProbe: mode === 'incompatible',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
  } catch (error) {
    await stop()
    throw error
  }

  return {
    config,
    stop,
    async run(page) {
      const setup = 'install'
      const initialStatus = await getRuntimeSetupStatus(page)
      assert.equal(initialStatus.kind, 'not-installed')
      await absentSlots(runtime)
      const review = expectedReview(transport)
      const noConsentWrites = async () => {
        assert.deepEqual(requests, [])
        assert.equal((await getRuntimeSetupProgress(page)).operation, null)
        assert.deepEqual(await readdir(downloads), [])
        await absentSlots(runtime)
        await absence(journal)
        await absence(lama)
      }
      await openRuntimeSetupReview(page, setup, review)
      await noConsentWrites()
      await dismissRuntimeSetupReview(page, setup)
      await noConsentWrites()
      await openRuntimeSetupReview(page, setup, review)
      await noConsentWrites()
      const freeBytesAtConsent = await freeSpace(runtime)
      await page.evaluate(() => {
        const stages = []
        const stop = globalThis.api.runtime.onInstallationProgressChanged(({ operation }) => {
          if (operation && stages.at(-1) !== operation.stage) stages.push(operation.stage)
        })
        globalThis.readPackagedSetupControlStages = () => {
          stop()
          delete globalThis.readPackagedSetupControlStages
          return stages
        }
      })
      await confirmRuntimeSetupReview(page, setup)

      let transfer = null
      let terminal
      if (mode === 'cancel') {
        transfer = await waitForRuntimeSetupProgress(page, setup, {
          stage: 'downloading-runtime',
          minimumBytes: 1,
          totalBytes: archiveBytes,
        })
        assert.ok(transfer.bytesDownloaded <= cancelPrefixBytes)
        await waitClosed(tasks)
        await cancelRuntimeSetupTransfer(page, setup)
        terminal = await waitForRuntimeSetupCancelled(page, setup)
        assert.equal(terminal.operationId, transfer.operationId)
      } else {
        await waitForRuntimeSetupError(page, setup, genericFailure)
        terminal = (await getRuntimeSetupProgress(page)).operation
        assert.equal(terminal?.mode, setup)
        assert.equal(terminal.state, 'failed')
      }
      await waitClosed([...tasks, ...closes])
      const stages = await page.evaluate(() => globalThis.readPackagedSetupControlStages())
      assert.equal(stages.at(-1), 'finalizing')
      assert.equal(stages.includes('downloading-runtime'), mode !== 'incompatible')
      assert.equal(stages.includes('extracting-runtime'), mode === 'disk')
      assert.equal(stages.includes('copying-runtime'), mode === 'disk')
      assert.ok(!stages.includes('assembling-runtime') && !stages.includes('checking-runtime'))
      assert.deepEqual(
        requests.map(({ route }) => route),
        expectedRoutes,
      )
      for (const request of requests) {
        assert.equal(request.failure, null)
        assert.equal(request.closed, true)
        assert.equal(request.finished, mode !== 'cancel')
      }
      await absentSlots(runtime)
      const status = await getRuntimeSetupStatus(page)
      assert.equal(status.kind, 'not-installed')
      assert.equal(status.runtimeId, undefined)

      const freeBytesAfter = await freeSpace(runtime)
      let outcome
      if (mode === 'disk') {
        assert.ok(freeBytesAfter < runtimeFloor, 'Host volume must reach the signed disk floor.')
        const [archiveRequest, lamaRequest] = requests
        assert.equal(archiveRequest.sentBytes, archiveBytes)
        assert.equal(archiveRequest.responseSha256, inputs.archive.sha256)
        assert.equal(lamaRequest.sentBytes, lamaBytes)
        assert.equal(lamaRequest.responseSha256, inputs.lama.sha256)
        assert.deepEqual(await readdir(cache), ['transport'])
        const cached = path.join(cache, 'transport')
        assert.deepEqual((await readdir(cached)).sort(), [
          'runtime-payload.zip',
          'runtime-release.json',
          'runtime-transport.json',
        ])
        const cachedZip = path.join(cached, 'runtime-payload.zip')
        assert.equal((await lstat(cachedZip)).size, archiveBytes)
        assert.equal(await hashFile(cachedZip), inputs.archive.sha256)
        assert.equal(
          await hashFile(path.join(cached, 'runtime-release.json')),
          inputs.runtimeEnvelope.sha256,
        )
        assert.equal(
          await hashFile(path.join(cached, 'runtime-transport.json')),
          inputs.transportEnvelope.sha256,
        )
        assert.equal((await lstat(lama)).size, lamaBytes)
        assert.equal(await hashFile(lama), inputs.lama.sha256)
        const expanded = path.join(downloads, `engine-${terminal.operationId}`)
        assert.deepEqual(
          (await readdir(downloads)).sort(),
          [path.basename(expanded), path.basename(cache)].sort(),
        )
        assert.deepEqual((await readdir(expanded)).sort(), ['payload', 'runtime-release.json'])
        assert.equal(
          await hashFile(path.join(expanded, 'runtime-release.json')),
          inputs.runtimeEnvelope.sha256,
        )
        const extracted = await verifyExpanded(path.join(expanded, 'payload'), manifest)
        assert.equal(extracted.entries, transport.entryCount)
        assert.equal(extracted.regularBytes, transport.expandedRegularBytes)
        const failed = JSON.parse(await readFile(journal, 'utf8'))
        assert.equal(failed.phase, 'failed')
        assert.equal(failed.mode, 'install')
        assert.equal(failed.candidatePointer, null)
        assert.equal(failed.previousPointer, null)
        assert.equal(failed.prepared, null)
        outcome = { extracted, freeBytesAtConsent, freeBytesAfter, runtimeFloor, journal: failed }
      } else {
        await absence(lama)
        await absence(journal)
        if (mode === 'incompatible') {
          assert.deepEqual(await readdir(downloads), [])
          const logs = path.join(dataRoot, 'logs/worker')
          const names = (await readdir(logs)).filter((name) =>
            /^runtime-host-preflight-.+\.log$/.test(name),
          )
          assert.equal(names.length, 1)
          const probe = await readFile(path.join(logs, names[0]), 'utf8')
          assert.match(probe, /1\.0, 8\.9/)
          outcome = { controlledPreflightLog: path.join(logs, names[0]) }
        } else {
          assert.deepEqual(await readdir(downloads), [path.basename(cache)])
          await assertIncomplete(cache)
          const [request] = requests
          if (mode === 'cancel') {
            assert.equal(request.sentBytes, cancelPrefixBytes)
            outcome = { canceledAfterClaimedBytes: transfer.bytesDownloaded }
          } else {
            assert.equal(request.sentBytes, archiveBytes)
            assert.notEqual(request.responseSha256, inputs.archive.sha256)
            assert.match(request.responseSha256, /^[a-f0-9]{64}$/)
            outcome = {
              artifactByteLength: request.sentBytes,
              rejectedSha256: request.responseSha256,
            }
          }
        }
      }
      return { mode, review, transfer, terminal, status, stages, outcome, requests }
    },
  }
}
