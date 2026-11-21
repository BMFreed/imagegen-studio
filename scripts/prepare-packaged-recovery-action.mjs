/** Build exact current A/B/C AppImages for the controlled local recovery-action run. */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { verifyApplicationReleaseAuthority } from '../src/main/application-updates/application-release.ts'
import { INFERENCE_WORKER_PROTOCOL_VERSION } from '../src/main/projects/generation-worker-client.ts'
import { CPU_WORKER_PROTOCOL_VERSION } from '../src/main/projects/worker-client.ts'
import { canonicalRuntimeReleaseJson as canonical } from '../src/main/runtime/runtime-release.ts'
import { IGS_SCHEMA_VERSION } from '../src/shared/projects/project-schema.ts'

const repo = path.dirname(import.meta.dirname)
const artifactRoot = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-recovery-action',
)
const [run, ...extra] = process.argv.slice(2)
assert.ok(
  run &&
    (extra.length === 0 ||
      (extra.length === 1 && ['--kde-save', '--kde-install-next'].includes(extra[0]))),
)
const kdeSave = extra.length === 1
const kdeInstallNext = extra[0] === '--kde-install-next'
assert.equal(await fs.realpath(run), run)
assert.equal(path.dirname(run), artifactRoot)
assert.equal((await fs.lstat(run)).uid, process.geteuid())
assert.equal(
  JSON.parse(await fs.readFile(path.join(run, 'artifact-lifecycle.json'), 'utf8')).state,
  'running',
)
const payloads = path.join(run, 'payloads')
await fs.mkdir(payloads, { mode: 0o700 })
const outputs = path.join(payloads, 'build')
await fs.mkdir(outputs, { mode: 0o700 })
const writeJson = (name, data) =>
  fs.writeFile(path.join(run, name), JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })

const hashBytes = (contents) => createHash('sha256').update(contents).digest('hex')
async function hash(file, algorithm = 'sha256') {
  const digest = createHash(algorithm)
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest(algorithm === 'sha512' ? 'base64' : 'hex')
}

const require = createRequire(path.join(repo, 'package.json'))
const { build, createTargets, Platform } = require('electron-builder')
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asarRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const { extractFile } = asarRequire('@electron/asar')
const config = require(path.join(repo, 'electron-builder.config.cjs'))
const electronVersion = require('electron/package.json').version
const builderVersion = require('electron-builder/package.json').version
assert.equal(electronVersion, '44.4.5')
assert.equal(builderVersion, '26.17.0')
assert.equal(config.appId, 'studio.imagegen.desktop')
const electronDist = await fs.realpath(
  path.join(path.dirname(require.resolve('electron/package.json')), 'dist'),
)
const sqlite = await fs.realpath(
  path.join(
    path.dirname(require.resolve('better-sqlite3/package.json')),
    'prebuilds/linux-x64.node',
  ),
)
const sqliteSha256 = await hash(sqlite)
const bootstrap = path.join(repo, 'scripts/fixtures/packaged-recovery-action-bootstrap.cjs')
const bootstrapSha256 = await hash(bootstrap)
const dist = {}
async function recordDist(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) await recordDist(file)
    else {
      assert.ok(item.isFile())
      if (!file.endsWith('.map')) dist[path.relative(repo, file)] = await hash(file)
    }
  }
}
for (const directory of ['main', 'preload', 'renderer'])
  await recordDist(path.join(repo, 'dist', directory))
assert.ok(
  dist['dist/main/main.cjs'] &&
    dist['dist/preload/preload.cjs'] &&
    dist['dist/renderer/index.html'],
)
const databaseMigrations = []
for (const name of (await fs.readdir(path.join(repo, 'src/main/db/migrations'))).sort()) {
  assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/)
  const sha256 = await hash(path.join(repo, 'src/main/db/migrations', name))
  assert.equal(dist[`dist/main/migrations/${name}`], sha256)
  databaseMigrations.push({ name, sha256 })
}

const socket = net.createServer()
await new Promise((resolve, reject) => {
  socket.once('error', reject)
  socket.listen(0, '127.0.0.1', resolve)
})
const feedPort = socket.address().port
await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())))
const feedUrl = `http://127.0.0.1:${feedPort}/`
const pair = generateKeyPairSync('ed25519')
const keyId = 'qualification-recovery-action'
const trustedKeys = { [keyId]: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
const compatibility = {
  cpuWorkerProtocolVersion: CPU_WORKER_PROTOCOL_VERSION,
  databaseMigrations,
  inferenceWorkerProtocolVersion: INFERENCE_WORKER_PROTOCOL_VERSION,
  projectSchemaVersion: IGS_SCHEMA_VERSION,
}
const publicTrust = { appId: config.appId, keys: trustedKeys, schemaVersion: 1 }
const trust = { compatibility, trustedKeys }
const releases = {}
for (const version of kdeSave && !kdeInstallNext
  ? ['0.1.0', '0.2.0']
  : ['0.1.0', '0.2.0', '0.3.0']) {
  let embedded
  const images = await build({
    projectDir: repo,
    targets: createTargets([Platform.LINUX], 'AppImage', 'x64'),
    publish: 'never',
    config: {
      ...config,
      directories: { output: path.join(outputs, version) },
      electronDist,
      electronVersion,
      extraMetadata: { main: path.basename(bootstrap), version },
      files: [
        ...config.files,
        { from: path.dirname(bootstrap), to: '.', filter: [path.basename(bootstrap)] },
      ],
      linux: { ...config.linux, artifactName: 'recovery-qualification-${version}-${arch}.${ext}' },
      npmRebuild: false,
      afterPack: async ({ appOutDir }) => {
        const resources = path.join(appOutDir, 'resources')
        const archive = path.join(resources, 'app.asar')
        const metadata = JSON.parse(extractFile(archive, 'package.json').toString('utf8'))
        assert.equal(metadata.main, path.basename(bootstrap))
        assert.equal(metadata.version, version)
        assert.equal(hashBytes(extractFile(archive, path.basename(bootstrap))), bootstrapSha256)
        for (const [file, expected] of Object.entries(dist))
          assert.equal(hashBytes(extractFile(archive, file)), expected, file)
        const packagedSqlite = path.join(
          resources,
          'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/linux-x64.node',
        )
        assert.equal(await hash(packagedSqlite), sqliteSha256)
        embedded = {
          asarSha256: await hash(archive),
          executableSha256: await hash(path.join(appOutDir, config.executableName)),
        }
        await fs.writeFile(path.join(resources, 'app-update-trust.json'), canonical(publicTrust), {
          flag: 'wx',
          mode: 0o644,
        })
        await fs.writeFile(
          path.join(resources, 'app-update.yml'),
          `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: imagegen-studio-recovery-qualification\n`,
          { flag: 'wx', mode: 0o644 },
        )
      },
    },
  })
  const [image] = images.filter((file) => file.endsWith('.AppImage'))
  assert.ok(image && embedded)
  const filename = await fs.realpath(image)
  assert.equal(path.dirname(filename), path.join(outputs, version))
  const { size: sizeBytes } = await fs.stat(filename)
  const sha512 = await hash(filename, 'sha512')
  const sha256 = await hash(filename)
  const notes = `Owned local recovery-action qualification release ${version}`
  const releaseNotesJson = canonical(notes).toString()
  const payload = canonical({
    appId: config.appId,
    artifact: { filename: path.basename(filename), sha512, sizeBytes },
    compatibility: { ...compatibility, runtimeValidation: 'after-restart' },
    releaseId: `owned-recovery-action-${version}`,
    releaseNotesSha256: hashBytes(releaseNotesJson),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version,
  })
  const envelope = canonical({
    keyId,
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, pair.privateKey).toString('base64'),
  }).toString()
  const authority = { envelope, releaseNotesJson }
  assert.equal(verifyApplicationReleaseAuthority(authority, trust).version, version)
  const metadata = [
    `version: ${JSON.stringify(version)}`,
    'files:',
    `  - url: ${path.basename(filename)}`,
    `    sha512: ${sha512}`,
    `    size: ${sizeBytes}`,
    `releaseNotes: ${JSON.stringify(notes)}`,
    `imagegenStudioRelease: ${JSON.stringify(envelope)}`,
    'releaseDate: "2026-11-19T00:00:00.000Z"',
    '',
  ].join('\n')
  releases[version] = { authority, embedded, filename, metadata, sha256, sha512, sizeBytes }
}
for (const [file, expected] of Object.entries(dist))
  assert.equal(await hash(path.join(repo, file)), expected)
assert.equal(await hash(sqlite), sqliteSha256)
assert.equal(await hash(bootstrap), bootstrapSha256)
await writeJson('package-manifest.json', {
  bootstrapSha256,
  builderVersion,
  dist,
  electronVersion,
  feedPort,
  fuses: config.electronFuses,
  ...(kdeInstallNext ? { kdeInstallNext } : {}),
  ...(kdeSave ? { kdeSave } : {}),
  privateKeyRetained: false,
  releases,
  sqliteSha256,
  trust,
})
