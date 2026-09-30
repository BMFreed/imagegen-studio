import type { GenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'

import assert from 'node:assert/strict'
import { ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'

import {
  GenerationWorkerClient,
  GenerationWorkerError,
  type GenerationWorkerLocation,
} from './generation-worker-client.js'

type Fixture = {
  executable: string
  location: GenerationWorkerLocation
  root: string
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-inference-client-'))
  const runtimeRoot = path.join(root, 'runtime')
  const scratchBasePath = path.join(root, 'scratch')
  await mkdir(runtimeRoot)
  await mkdir(scratchBasePath)
  const executable = path.join(runtimeRoot, 'python')
  const script = String.raw`#!${process.execPath}
const fs = require('node:fs')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1') process.exit(23)
const mode = process.env.FAKE_MODE || 'done'
if (process.env.FAKE_SPAWN_MARKER) {
  fs.appendFileSync(process.env.FAKE_SPAWN_MARKER, String(process.pid) + '\n')
}
const ready = {
  type:'ready', protocolVersion:mode === 'bad-protocol' ? '2' : '1',
  workerVersion: mode === 'bad-version' ? '0.1.0' : mode === 'future-version' ? '0.4.0' : mode.startsWith('progress-') || mode === 'new-missing-progress' ? '0.3.0' : '0.2.0',
  runtimeProfile:mode === 'bad-profile' ? 'derivatives-only' : 'linux-nvidia',
  pythonVersion:'3.12.13',
  capabilities: mode === 'no-capability' ? [] : mode.startsWith('progress-') ? ['illustrious-txt2img', 'denoising-progress'] : ['illustrious-txt2img']
}
if (mode === 'delayed-sigterm' || mode === 'ignore-sigterm' || mode === 'silent-ignore-sigterm') {
  process.on('SIGTERM', () => {
    if (mode === 'delayed-sigterm') setTimeout(() => process.exit(0), 70)
  })
  setInterval(() => {}, 1000)
}
if (process.env.FAKE_EXIT_MARKER) {
  process.on('exit', () => fs.writeFileSync(process.env.FAKE_EXIT_MARKER, 'exited'))
}
if (mode === 'silent' || mode === 'silent-ignore-sigterm') { setInterval(() => {}, 1000) }
else if (mode === 'bad-json-ready') process.stdout.write('{oops\n')
else if (mode === 'oversized-ready') process.stdout.write('a'.repeat(65537))
else {
  const startup = JSON.stringify(ready) + '\n'
  process.stdout.write(mode === 'unsolicited-ready'
    ? startup + JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:'unasked',outputPath:'/tmp/unasked',seed:1}) + '\n'
    : startup)
  process.stdin.setEncoding('utf8')
  let buffer = ''
  let precedingRequestId = null
  process.stdin.on('data', chunk => {
    buffer += chunk
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n')
      const request = JSON.parse(buffer.slice(0,newline)); buffer = buffer.slice(newline+1)
      if (request.type !== 'generate-illustrious-txt2img') process.exit(22)
      if (process.env.FAKE_REQUEST_MARKER) fs.writeFileSync(process.env.FAKE_REQUEST_MARKER, request.requestId)
      if (mode === 'hang' || mode === 'delayed-sigterm' || mode === 'ignore-sigterm') continue
      if (mode === 'crash') process.exit(7)
      if (mode === 'invalid-json') { process.stdout.write('{oops\n'); continue }
      if (mode === 'oversized-response') { process.stdout.write('a'.repeat(65537)); continue }
      if (mode === 'worker-error') {
        process.stdout.write(JSON.stringify({type:'error',protocolVersion:'1',requestId:request.requestId,code:'MODEL_LOAD_FAILED',message:'Safe error.'})+'\n')
        continue
      }
      const response = {
        type:'generation-done', protocolVersion:'1', requestId:request.requestId,
        outputPath:request.job.output.pngPath, seed:0xffffffff
      }
      if (mode.startsWith('progress-') || mode === 'legacy-progress') {
        const send = (step, totalSteps = 3, extras = {}) => process.stdout.write(JSON.stringify({
          type:'generation-progress', protocolVersion:'1', requestId:request.requestId,
          step, totalSteps, ...extras
        }) + '\n')
        if (mode === 'progress-wrong-id') send(1, 3, {requestId:randomId()})
        else if (mode === 'progress-zero') send(0)
        else if (mode === 'progress-over-total') send(4)
        else if (mode === 'progress-too-many') send(1, 401)
        else if (mode === 'progress-too-many-for-request') send(1, 2 * request.job.sampling.steps + 1)
        else if (mode === 'progress-changed-total') { send(1); send(2, 4) }
        else if (mode === 'progress-extra-field') send(1, 3, {outputPath:'/private/weights'})
        else if (mode === 'progress-timeout') {
          let step = 0
          setInterval(() => send(Math.min(++step, 40), 40), 15)
        } else if (mode === 'progress-held') send(1)
        else if (mode === 'progress-complete-no-done') { send(1); send(2); send(3) }
        else if (mode === 'progress-stale') {
          if (precedingRequestId) send(2, 3, {requestId:precedingRequestId})
          send(1)
          precedingRequestId = request.requestId
        } else { send(1); send(2); send(2); send(1); send(3) }
        if (['progress-timeout','progress-held','progress-complete-no-done'].includes(mode)) continue
      }
      if (mode === 'wrong-id') response.requestId = randomId()
      if (mode === 'wrong-output') response.outputPath = '/tmp/other.png'
      if (mode === 'bad-seed') response.seed = -1
      if (mode === 'wrong-type') response.type = 'done'
      const answer = JSON.stringify(response)+'\n'
      if (mode === 'late-done-after-wrong') {
        const wrong = {...response, requestId:randomId()}
        process.stdout.write(JSON.stringify(wrong)+'\n'+answer)
      } else {
        process.stdout.write(answer)
        if (mode === 'progress-stale') process.stdout.write(JSON.stringify({
          type:'generation-progress', protocolVersion:'1', requestId:request.requestId,
          step:2, totalSteps:3
        })+'\n')
      }
    }
  })
}
function randomId() { return '00000000-0000-4000-8000-000000000000' }
`
  await writeFile(executable, script)
  await chmod(executable, 0o700)
  try {
    await run({
      executable,
      location: { pythonExecutable: executable, runtimeRoot, scratchBasePath },
      root,
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function requestFor(fixture: Fixture): Promise<IllustriousTxt2ImgRequestV1> {
  const stage = await mkdtemp(path.join(fixture.location.scratchBasePath, 'illustrious-request-'))
  const targetPath = path.join(stage, 'target.png')
  await writeFile(targetPath, 'frozen target')
  return {
    job: {
      bbox: { height: 64, width: 64, x: 0, y: 0 },
      checkpoint: {
        path: path.join(fixture.root, 'model.safetensors'),
        predictionType: 'epsilon',
        sha256: 'a'.repeat(64),
      },
      output: { pngPath: path.join(stage, 'result.png'), stagingRoot: stage },
      prompts: { negative: '', positive: 'portrait' },
      sampling: { cfgScale: 5, scheduler: 'euler_a', seed: 123, steps: 20 },
      schemaVersion: 1,
      target: {
        byteSize: 13,
        height: 64,
        iccSha256: 'c'.repeat(64),
        path: targetPath,
        sha256: 'b'.repeat(64),
        width: 64,
      },
    },
    protocolVersion: '1',
    requestId: randomUUID(),
    type: 'generate-illustrious-txt2img',
  }
}

function options(mode: string, more: Record<string, string> = {}) {
  return {
    environment: { FAKE_MODE: mode, ...more },
    requestTimeoutMs: 300,
    shutdownWaitMs: 40,
    startupTimeoutMs: 300,
  }
}

function isCode(code: GenerationWorkerError['code']) {
  return (error: unknown): boolean => error instanceof GenerationWorkerError && error.code === code
}

test('real inference subprocess requires an exact ready and returns correlated actual seed', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(
      fixture.location,
      options('done', { HF_HUB_OFFLINE: '0', TRANSFORMERS_OFFLINE: '0' }),
    )
    try {
      assert.deepEqual(client.ready.capabilities, ['illustrious-txt2img'])
      const request = await requestFor(fixture)
      const result = await client.generate(request)
      assert.deepEqual(result, {
        outputPath: request.job.output.pngPath,
        protocolVersion: '1',
        requestId: request.requestId,
        seed: 0xff_ff_ff_ff,
        type: 'generation-done',
      })
    } finally {
      await client.close()
    }
  })
})

test('unqualified, silent, malformed, and unsolicited startup fail before a client is returned', async () => {
  await withFixture(async (fixture) => {
    for (const mode of [
      'bad-protocol',
      'bad-version',
      'future-version',
      'bad-profile',
      'no-capability',
      'new-missing-progress',
    ]) {
      await assert.rejects(
        GenerationWorkerClient.start(fixture.location, options(mode)),
        isCode('WORKER_VERSION_MISMATCH'),
        mode,
      )
    }
    for (const mode of ['bad-json-ready', 'oversized-ready', 'unsolicited-ready']) {
      await assert.rejects(
        GenerationWorkerClient.start(fixture.location, options(mode)),
        isCode('PROTOCOL_ERROR'),
        mode,
      )
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, options('silent')),
      isCode('STARTUP_TIMEOUT'),
    )
  })
})

test('qualified JSONL progress is monotonic, request-scoped, and cannot replace the terminal result', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-done'))
    try {
      assert.equal(client.ready.workerVersion, '0.3.0', 'preserve the actual qualified version')
      const observed: GenerationDenoisingProgress[] = []
      const request = await requestFor(fixture)
      const done = await client.generate(request, (progress) => {
        assert.equal(Object.isFrozen(progress), true)
        observed.push(progress)
      })
      assert.deepEqual(observed, [
        { step: 1, totalSteps: 3 },
        { step: 2, totalSteps: 3 },
        { step: 3, totalSteps: 3 },
      ])
      assert.equal((done as { requestId: string }).requestId, request.requestId)
      assert.equal((done as { type: string }).type, 'generation-done')
    } finally {
      await client.close()
    }
  })
})

test('a throwing progress observer does not reject a valid inference result', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-done'))
    try {
      let callbacks = 0
      const done = await client.generate(await requestFor(fixture), () => {
        callbacks += 1
        throw new Error('presentation observer failed')
      })
      assert.equal(callbacks, 3)
      assert.equal((done as { type: string }).type, 'generation-done')
    } finally {
      await client.close()
    }
  })
})

test('settled generation progress is ignored after completion and while the next request is active', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-stale'))
    try {
      const first: GenerationDenoisingProgress[] = []
      const second: GenerationDenoisingProgress[] = []
      await client.generate(await requestFor(fixture), (progress) => first.push(progress))
      await client.generate(await requestFor(fixture), (progress) => second.push(progress))
      assert.deepEqual(first, [{ step: 1, totalSteps: 3 }])
      assert.deepEqual(second, [{ step: 1, totalSteps: 3 }])
      assert.equal(client.ready.workerVersion, '0.3.0')
    } finally {
      await client.close()
    }
  })
})

test('legacy, crossed, malformed, unbounded and inconsistent progress fail the actual exchange', async () => {
  await withFixture(async (fixture) => {
    for (const mode of [
      'legacy-progress',
      'progress-wrong-id',
      'progress-zero',
      'progress-over-total',
      'progress-too-many',
      'progress-too-many-for-request',
      'progress-changed-total',
      'progress-extra-field',
    ]) {
      const client = await GenerationWorkerClient.start(fixture.location, options(mode))
      try {
        await assert.rejects(
          client.generate(await requestFor(fixture)),
          isCode('PROTOCOL_ERROR'),
          mode,
        )
        await assert.rejects(client.generate(await requestFor(fixture)), isCode('CLOSED'), mode)
      } finally {
        await client.close()
      }
    }
  })
})

test('progress keeps the request slot occupied and close rejects a generation without done', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('progress-held'),
      requestTimeoutMs: 5000,
    })
    try {
      let acknowledge!: () => void
      const observed = new Promise<void>((resolve) => {
        acknowledge = resolve
      })
      const pending = client.generate(await requestFor(fixture), () => acknowledge())
      void pending.catch(() => undefined)
      await observed
      await assert.rejects(client.generate(await requestFor(fixture)), isCode('BUSY'))
      await client.close()
      await assert.rejects(pending, isCode('CLOSED'))
    } finally {
      await client.close()
    }
  })
})

test('complete denoising progress still times out without a terminal completion', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(
      fixture.location,
      options('progress-complete-no-done'),
    )
    try {
      const observed: GenerationDenoisingProgress[] = []
      await assert.rejects(
        client.generate(await requestFor(fixture), (progress) => observed.push(progress)),
        isCode('REQUEST_TIMEOUT'),
      )
      assert.equal(observed.at(-1)?.step, 3)
    } finally {
      await client.close()
    }
  })
})

test(
  'continuous valid progress does not reset the original request deadline',
  { timeout: 2500 },
  async () => {
    await withFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        ...options('progress-timeout'),
        requestTimeoutMs: 120,
      })
      try {
        let callbacks = 0
        await assert.rejects(
          client.generate(await requestFor(fixture), () => {
            callbacks += 1
          }),
          isCode('REQUEST_TIMEOUT'),
        )
        assert.ok(callbacks > 1, 'the real child emitted multiple steps before the deadline')
      } finally {
        await client.close()
      }
    })
  },
)

test('transport rejects unowned executable, scratch, and unsafe target paths', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, pythonExecutable: process.execPath }),
      isCode('INVALID_PATH'),
    )
    const escapedExecutable = path.join(fixture.location.runtimeRoot, 'python-outside')
    await symlink(process.execPath, escapedExecutable)
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, pythonExecutable: escapedExecutable }),
      isCode('INVALID_PATH'),
    )
    const outside = path.join(fixture.root, 'outside')
    await mkdir(outside)
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, scratchBasePath: `${outside}/..` }),
      isCode('INVALID_PATH'),
    )
    const client = await GenerationWorkerClient.start(fixture.location, options('done'))
    try {
      const request = await requestFor(fixture)
      const external = path.join(fixture.root, 'external')
      await mkdir(external)
      request.job.output.stagingRoot = external
      request.job.target.path = path.join(external, 'target.png')
      request.job.output.pngPath = path.join(external, 'result.png')
      await assert.rejects(client.generate(request), isCode('INVALID_PATH'))
      const valid = await requestFor(fixture)
      await rm(valid.job.target.path)
      await symlink(path.join(fixture.root, 'external-target'), valid.job.target.path)
      await assert.rejects(client.generate(valid), isCode('INVALID_PATH'))
      const missing = await requestFor(fixture)
      await rm(missing.job.target.path)
      await assert.rejects(client.generate(missing), isCode('INVALID_PATH'))
      const occupied = await requestFor(fixture)
      await writeFile(occupied.job.output.pngPath, 'already present')
      await assert.rejects(client.generate(occupied), isCode('INVALID_PATH'))
      const oversized = await requestFor(fixture)
      oversized.job.prompts.positive = 'x'.repeat(65_536)
      await assert.rejects(client.generate(oversized), isCode('INVALID_REQUEST'))
      const accepted = await requestFor(fixture)
      assert.deepEqual(
        ((await client.generate(accepted)) as { requestId: string }).requestId,
        accepted.requestId,
      )
    } finally {
      await client.close()
    }
  })
})

test('worker errors and malformed completions fail closed on the real child boundary', async () => {
  await withFixture(async (fixture) => {
    for (const [mode, code] of [
      ['worker-error', 'WORKER_REQUEST_FAILED'],
      ['wrong-id', 'PROTOCOL_ERROR'],
      ['wrong-output', 'PROTOCOL_ERROR'],
      ['bad-seed', 'PROTOCOL_ERROR'],
      ['wrong-type', 'PROTOCOL_ERROR'],
      ['invalid-json', 'PROTOCOL_ERROR'],
      ['oversized-response', 'PROTOCOL_ERROR'],
      ['late-done-after-wrong', 'PROTOCOL_ERROR'],
      ['crash', 'WORKER_EXITED'],
    ] as const) {
      const client = await GenerationWorkerClient.start(fixture.location, options(mode))
      try {
        await assert.rejects(client.generate(await requestFor(fixture)), isCode(code), mode)
        await assert.rejects(client.generate(await requestFor(fixture)), isCode('CLOSED'), mode)
      } finally {
        await client.close()
      }
    }
  })
})

test('a hung generation times out and close confirms subprocess exit', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'exit-marker')
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('delayed-sigterm', { FAKE_EXIT_MARKER: marker }),
      shutdownWaitMs: 250,
    })
    await assert.rejects(client.generate(await requestFor(fixture)), isCode('REQUEST_TIMEOUT'))
    await client.close()
    assert.equal(existsSync(marker), true)
  })
})

test('an active generation rejects on close, retains a single request slot, and waits for exit', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'request-marker')
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('ignore-sigterm', { FAKE_REQUEST_MARKER: marker }),
      requestTimeoutMs: 5000,
    })
    try {
      const pending = client.generate(await requestFor(fixture))
      void pending.catch(() => undefined)
      for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt += 1) {
        await delay(5)
      }
      assert.equal(existsSync(marker), true, 'the real child received the active request')
      await assert.rejects(client.generate(await requestFor(fixture)), isCode('BUSY'))
      const close = client.close()
      await assert.rejects(pending, isCode('CLOSED'))
      await close
    } finally {
      await client.close()
    }
  })
})

test('close escalates to SIGKILL, and unconfirmed exit remains retryable', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('ignore-sigterm'))
    const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
    const pid = child.pid
    assert.ok(pid)
    await client.close()
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    await client.close()

    const retry = await GenerationWorkerClient.start(fixture.location, options('ignore-sigterm'))
    const retryChild = (retry as unknown as { child: ChildProcessWithoutNullStreams }).child
    const actualKill = retryChild.kill.bind(retryChild)
    retryChild.kill = () => true
    try {
      await assert.rejects(retry.close(), isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(retry.generate(await requestFor(fixture)), isCode('CLOSED'))
    } finally {
      retryChild.kill = actualKill
      await retry.close()
    }
  })
})

test('an unconfirmed startup child blocks concurrent and later starts until its exit is observed', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'started-pids')
    const actualKill = ChildProcess.prototype.kill
    ChildProcess.prototype.kill = function (this: ChildProcess, signal) {
      return this.spawnfile === fixture.executable ? true : actualKill.call(this, signal)
    }
    try {
      const first = GenerationWorkerClient.start(
        fixture.location,
        options('silent-ignore-sigterm', { FAKE_SPAWN_MARKER: marker }),
      )
      for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt += 1) {
        await delay(5)
      }
      assert.equal(existsSync(marker), true, 'the first subprocess started')
      const concurrent = GenerationWorkerClient.start(
        fixture.location,
        options('done', { FAKE_SPAWN_MARKER: marker }),
      )
      await assert.rejects(first, isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(concurrent, isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(
        GenerationWorkerClient.start(
          fixture.location,
          options('done', { FAKE_SPAWN_MARKER: marker }),
        ),
        isCode('WORKER_EXIT_UNCONFIRMED'),
      )
      assert.equal(await GenerationWorkerClient.retryUnconfirmedStartExit(), false)
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 1)

      ChildProcess.prototype.kill = actualKill
      assert.equal(await GenerationWorkerClient.retryUnconfirmedStartExit(), true)
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 1)
      const recovered = await GenerationWorkerClient.start(
        fixture.location,
        options('done', { FAKE_SPAWN_MARKER: marker }),
      )
      await recovered.close()
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 2)
    } finally {
      ChildProcess.prototype.kill = actualKill
      if (existsSync(marker)) {
        for (const pid of (await readFile(marker, 'utf8')).trim().split('\n').map(Number)) {
          try {
            // PID reuse must not let test cleanup signal an unrelated process.
            const commandLine = await readFile(`/proc/${pid}/cmdline`, 'utf8')
            if (commandLine.includes(fixture.executable)) {
              process.kill(pid, 'SIGKILL')
            }
          } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
              throw error
            }
          }
        }
      }
    }
  })
})
