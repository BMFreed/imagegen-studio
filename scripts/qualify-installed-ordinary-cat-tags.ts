import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../src/shared/projects/generation-progress.js'
import { defaultIllustriousNoiseProfile } from '../src/shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.js'
import {
  type IllustriousGenerationRequestV1,
  withIllustriousGenerationRequest,
} from '../src/main/projects/illustrious-txt2img-job.js'
import { captureInferenceWorkerOwner } from '../src/main/projects/inference-worker-ownership.js'
import {
  ORDINARY_CAT_TAGS_CASES,
  ORDINARY_CAT_TAGS_CONTRACT,
  ORDINARY_IMG_RECOLOR_CASES,
  ORDINARY_IMG_RECOLOR_CONTRACT,
  produceOrdinaryCatTagsProbe,
  produceOrdinaryImgRecolorProbe,
} from '../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.js'
import { readSmartPatchModelSourceOutput } from '../src/main/projects/worker-client.js'

const installedHelpers = new URL('./qualify-installed-reference-img-utility.mts', import.meta.url)
const {
  artifactRoot,
  assertRuntimeIdle,
  assertUpgradeBounds,
  bytesAt,
  children,
  errorText,
  observeGpu,
  readEngine,
  regular,
  sha,
  verify,
  workerExited,
  writeJson,
} = (await import(
  installedHelpers.href
)) as typeof import('./qualify-installed-reference-img-utility.mjs')

const execute = promisify(execFile)
const repository = path.resolve(import.meta.dirname, '..')
const invoke = path.resolve(repository, '../sources/InvokeAI')
const runRoot = path.join(artifactRoot, 'runs/ordinary-cat-tags')
const checkpoint = path.join(
  artifactRoot,
  'shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors',
)
const checkpointSha = '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9'
const checkpointBytes = 6_938_040_760
const box = { height: 1024, width: 1024, x: -13, y: 5 }
const steps = 30

const ownerFiles = [
  'scripts/qualify-installed-ordinary-cat-tags.ts',
  'scripts/qualify-installed-reference-img-utility.mts',
  'scripts/upgrade-qualification-worker.mjs',
  'src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts',
  'src/main/projects/project-generation-preparation.ts',
  'src/main/projects/illustrious-txt2img-job.ts',
  'src/main/projects/generation-worker-client.ts',
  'src/main/projects/inference-worker-ownership.ts',
  'src/main/projects/worker-client.ts',
]
const invokeFiles = [
  'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
  'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
  'invokeai/app/invocations/text_encoder/compel.py',
  'invokeai/app/invocations/noise.py',
  'invokeai/app/invocations/latent_noise.py',
  'invokeai/app/invocations/sd/denoise_latents.py',
]

async function sourceHashes(directory: string, files: string[]) {
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, sha(await bytesAt(path.join(directory, file)))]),
    ),
  )
}

async function revision(directory: string) {
  return (
    await execute('git', ['-C', directory, 'rev-parse', 'HEAD'], { timeout: 10_000 })
  ).stdout.trim()
}

async function verifyCheckpoint() {
  const before = await regular(checkpoint)
  assert.equal(before.size, checkpointBytes)
  const file = await open(
    checkpoint,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await file.stat({ bigint: true })
    assert.equal(String(stat.dev), before.dev)
    assert.equal(String(stat.ino), before.ino)
    const digest = createHash('sha256')
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      digest.update(chunk)
    }
    assert.equal(digest.digest('hex'), checkpointSha)
    assert.deepEqual(await regular(checkpoint), before)
  } finally {
    await file.close()
  }
  return before
}

function pairedInputs(request: IllustriousGenerationRequestV1) {
  const { output: _output, prompts, target, ...job } = request.job
  const { path: _path, ...targetContent } = target
  return {
    job: { ...job, prompts: { negative: prompts.negative }, target: targetContent },
    protocolVersion: request.protocolVersion,
    type: request.type,
  }
}

async function runtimeIdle(engine: Awaited<ReturnType<typeof readEngine>>) {
  const mountpoint = path.join(path.dirname(path.dirname(engine.pythonExecutable)), 'bootstrap')
  const mount = await execute(
    'findmnt',
    ['--json', '--mountpoint', mountpoint, '--output', 'TARGET,FSTYPE,SOURCE'],
    { timeout: 10_000 },
  ).catch((error: { code?: number; stderr?: string }) => {
    if (error.code === 1 && error.stderr === '') {
      return null
    }
    throw error
  })
  if (!mount) {
    await assertRuntimeIdle(engine.appDataDir, engine.basePrefix)
    return null
  }
  assert.deepEqual(JSON.parse(mount.stdout).filesystems, [
    { fstype: 'fuse.fuse-overlayfs', source: 'fuse-overlayfs', target: mountpoint },
  ])
  const unit = 'imagegen-qualification-view@bootstrap.service'
  const { stdout } = await execute(
    'systemctl',
    ['--user', 'show', unit, '--property=MainPID,ControlGroup,ActiveState'],
    { timeout: 10_000 },
  )
  const fields = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  )
  assert.equal(fields.ActiveState, 'active')
  assert.match(fields.MainPID, /^[1-9]\d*$/)
  assert.equal(path.basename(fields.ControlGroup), unit)
  const proc = `/proc/${fields.MainPID}`
  const startTime = async () => {
    const stat = await readFile(`${proc}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  }
  const start = await startTime()
  assert.equal((await lstat(proc)).uid, process.getuid?.())
  assert.equal(await realpath(`${proc}/exe`), '/usr/bin/fuse-overlayfs')
  assert.equal(await realpath(`${proc}/cwd`), '/')
  assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), `0::${fields.ControlGroup}`)
  const cmdline = await readFile(`${proc}/cmdline`, 'utf8')
  const parts = cmdline.split('\0')
  assert.equal(parts.length, 6)
  assert.match(parts[3], /^lowerdir=.+,upperdir=.+,workdir=.+$/)
  assert.deepEqual(parts, ['fuse-overlayfs', '-f', '-o', parts[3], mountpoint, ''])

  // Only the verified view's mountpoint operand describes storage rather than execution.
  const scan = assertRuntimeIdle as (
    appData: string,
    python: string,
    options: { read: (file: string, encoding: 'utf8') => Promise<string> },
  ) => Promise<unknown>
  await scan(engine.appDataDir, engine.basePrefix, {
    async read(file, encoding) {
      const body = await readFile(file, encoding)
      if (file !== `${proc}/cmdline`) {
        return body
      }
      assert.equal(await startTime(), start)
      assert.equal(body, cmdline)
      return [...parts.slice(0, 4), ''].join('\0')
    },
  })
  return { mountpoint, pid: Number(fields.MainPID), start, unit }
}

async function main() {
  const run = process.argv[3] ?? ''
  assert.deepEqual(process.argv.slice(2), ['--run', run])
  const img = path.dirname(run) === path.join(artifactRoot, 'runs/ordinary-img-recolor')
  assert.ok(img || path.dirname(run) === runRoot)
  const contract = img ? ORDINARY_IMG_RECOLOR_CONTRACT : ORDINARY_CAT_TAGS_CONTRACT
  const cases = img ? ORDINARY_IMG_RECOLOR_CASES : ORDINARY_CAT_TAGS_CASES
  const bbox = img ? ORDINARY_IMG_RECOLOR_CONTRACT.bbox : box
  const executedSteps = img ? ORDINARY_IMG_RECOLOR_CONTRACT.executedSteps : steps
  const produce = img ? produceOrdinaryImgRecolorProbe : produceOrdinaryCatTagsProbe
  const operation = img ? 'illustrious-img2img' : 'illustrious-txt2img'
  assert.match(path.basename(run), /^\d{8}-r[1-9]\d*$/)
  assert.equal(await realpath(run), run)
  const directory = await lstat(run)
  assert.ok(directory.isDirectory() && directory.uid === process.getuid?.())
  const bounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
  assert.ok(bounds.unit.endsWith('.service'))
  const deadline = Date.now() + bounds.runtimeMaxSeconds * 1000
  const contractPath = path.join(run, 'experiment-contract.json')
  const contractBytes = await bytesAt(contractPath)
  assert.deepEqual(JSON.parse(contractBytes.toString()), contract)
  const applicationRevision = await revision(repository)
  const invokeRevision = await revision(invoke)
  assert.equal(applicationRevision, contract.base)
  assert.equal(invokeRevision, contract.invokeRevision)
  const checkedInvokeFiles = img
    ? [...invokeFiles, 'invokeai/app/invocations/vae/image_to_latents.py']
    : invokeFiles
  const source = {
    applicationRevision,
    files: await sourceHashes(repository, ownerFiles),
    invokeFiles: await sourceHashes(invoke, checkedInvokeFiles),
    invokeRevision,
  }
  const engine = await readEngine([
    operation,
    'illustrious-euler',
    'denoising-progress',
    'linux-owned-inference-v1',
  ])
  const enginePins = [...engine.pinned, ...engine.configs]
  const idle = () => runtimeIdle(engine)
  const bootstrapStorage = await idle()
  for (const pin of enginePins) {
    await verify(pin)
  }
  const checkpointBefore = await verifyCheckpoint()
  const outputRoot = path.join(run, 'native-outputs')
  const scratch = path.join(run, 'native-scratch')
  const hfHome = path.join(run, 'native-hf-home')
  for (const directory of [outputRoot, scratch, hfHome]) {
    await mkdir(directory, { mode: 0o700 })
  }
  const retain = (name: string, value: unknown) => writeJson(name, value, run)
  const checkpointPin = { byteSize: checkpointBytes, path: checkpoint, sha256: checkpointSha }
  await retain('native-start.json', {
    bootstrapStorage,
    bounds,
    cases,
    checkpoint: checkpointPin,
    contract: { byteSize: contractBytes.length, path: contractPath, sha256: sha(contractBytes) },
    installation: engine,
    source,
  })

  const controls = new Map<number, ReturnType<typeof pairedInputs>>()
  const results: unknown[] = []
  let targetSha: string | undefined
  let attempted = 0
  let submitted = 0
  let failure: unknown
  try {
    await produce({
      pythonExecutable: engine.pythonExecutable,
      run,
      runtimeRoot: engine.runtimeDir,
      async useCase({ case: testCase, models, prepared, recipe, references }) {
        assert.deepEqual(testCase, cases[attempted])
        assert.equal(
          prepared.context.kind,
          img ? 'normal-img2img-preparation' : 'normal-txt2img-preparation',
        )
        assert.deepEqual(prepared.context.bbox, bbox)
        assert.deepEqual(recipe.regions, [])
        assert.equal(references, undefined)
        const actualTarget = sha(prepared.targetPngBytes)
        assert.equal(prepared.context.target.sha256, actualTarget)
        if (img) {
          assert.equal(actualTarget, ORDINARY_IMG_RECOLOR_CONTRACT.source.sha256)
          assert.equal(
            prepared.targetPngBytes.length,
            ORDINARY_IMG_RECOLOR_CONTRACT.source.byteSize,
          )
        }
        targetSha ??= actualTarget
        assert.equal(actualTarget, targetSha)
        const target = path.join(outputRoot, `${testCase.label}.target.png`)
        await writeFile(target, prepared.targetPngBytes, { flag: 'wx', mode: 0o600 })

        await idle()
        const beforeChildren = new Set(await children())
        const remaining = deadline - Date.now()
        assert.ok(remaining > 0)
        attempted++
        const progress: GenerationDenoisingProgress[] = []
        let client: GenerationWorkerClient | undefined
        let owner: Awaited<ReturnType<typeof captureInferenceWorkerOwner>> | undefined
        let stopGpu: ReturnType<typeof observeGpu> | undefined
        let gpu: Awaited<ReturnType<ReturnType<typeof observeGpu>>> | undefined
        let output: { byteSize: number; path: string; sha256: string } | undefined
        let caseError: unknown
        let exitError: unknown
        let physicalExit = false
        try {
          const active = await GenerationWorkerClient.start(
            {
              pythonExecutable: engine.pythonExecutable,
              runtimeRoot: engine.runtimeDir,
              scratchBasePath: scratch,
            },
            {
              environment: {
                HF_DATASETS_OFFLINE: '1',
                HF_HOME: hfHome,
                HF_HUB_OFFLINE: '1',
                IGS_SDXL_CONFIG_DIR: engine.configDir,
                LANG: 'C.UTF-8',
                LC_ALL: 'C.UTF-8',
                TMPDIR: scratch,
                TOKENIZERS_PARALLELISM: 'false',
              },
              requestTimeoutMs: remaining,
              startupTimeoutMs: Math.min(120_000, remaining),
            },
          )
          client = active
          assert.deepEqual(active.ready, engine.ready)
          const created = (await children()).filter((pid) => !beforeChildren.has(pid))
          assert.equal(created.length, 1)
          owner = await captureInferenceWorkerOwner(created[0])
          const proc = `/proc/${owner.worker.pid}`
          assert.equal(await realpath(`${proc}/exe`), engine.exactPython)
          assert.equal(await realpath(`${proc}/cwd`), engine.runtimeDir)
          assert.equal((await readFile(`${proc}/cgroup`, 'utf8')).trim(), `0::${bounds.group}`)
          stopGpu = observeGpu(owner.worker.pid)

          output = await withIllustriousGenerationRequest({
            modelService: models,
            prepared,
            ready: active.ready,
            scratchBasePath: scratch,
            async use(request) {
              const { job } = request
              assert.equal(request.type, `generate-${operation}`)
              assert.deepEqual(job.bbox, bbox)
              if (img) {
                assert.ok('denoisingStrength' in job.sampling)
                assert.equal(
                  job.sampling.denoisingStrength,
                  ORDINARY_IMG_RECOLOR_CONTRACT.sampling.denoisingStrength,
                )
              }
              assert.deepEqual(job.checkpoint, {
                path: checkpoint,
                predictionType: 'epsilon',
                sha256: checkpointSha,
              })
              assert.deepEqual(job.prompts, { negative: '', positive: testCase.positive })
              assert.equal(job.target.sha256, actualTarget)
              assert.equal(job.target.iccSha256, IGS_SRGB_ICC_SHA256)
              assert.equal(job.sampling.seed, testCase.seed)
              assert.equal(job.sampling.steps, steps)
              assert.equal(job.sampling.scheduler, 'euler')
              assert.equal(job.sampling.cfgScale, 5)
              assert.equal(job.sampling.cfgRescale ?? 0, 0)
              assert.deepEqual(job.sampling.noiseProfile, defaultIllustriousNoiseProfile())
              assert.equal(job.vaePrecision, 'FP16')
              assert.ok(
                !job.vae &&
                  !job.loras?.length &&
                  !job.embeddings?.positive.length &&
                  !job.embeddings?.negative.length,
              )
              if (testCase.label === 'neutral' || testCase.label.endsWith('-prose')) {
                controls.set(testCase.seed, pairedInputs(request))
              } else {
                assert.deepEqual(pairedInputs(request), controls.get(testCase.seed))
              }
              await retain(`${testCase.label}.request.json`, {
                owner,
                recipe,
                request,
                target: {
                  byteSize: prepared.targetPngBytes.length,
                  path: target,
                  sha256: actualTarget,
                },
              })
              submitted++
              const response = (await active.generate(request, (event) => {
                assert.equal(event.totalSteps, executedSteps)
                assert.equal(event.step, progress.length + 1)
                progress.push({ ...event })
              })) as { outputPath: string; requestId: string; seed: number; type: string }
              assert.equal(response.type, 'generation-done')
              assert.equal(response.requestId, request.requestId)
              assert.equal(response.outputPath, job.output.pngPath)
              assert.equal(response.seed, testCase.seed)
              assert.equal(progress.length, executedSteps)
              const bytes = await bytesAt(job.output.pngPath, 32 * 1024 ** 2)
              const sha256 = sha(bytes)
              const png = await readSmartPatchModelSourceOutput(job.output.pngPath, {
                byteSize: bytes.length,
                colorSpace: 'srgb',
                height: bbox.height,
                iccSha256: IGS_SRGB_ICC_SHA256,
                path: job.output.pngPath,
                sha256,
                width: bbox.width,
              })
              const filename = path.join(outputRoot, `${testCase.label}.png`)
              await writeFile(filename, png, { flag: 'wx', mode: 0o600 })
              return { byteSize: png.length, path: filename, sha256 }
            },
          })
        } catch (error) {
          caseError = error
        } finally {
          gpu = await stopGpu?.()
          try {
            await client?.close()
            if (owner) {
              await workerExited(owner)
              physicalExit = true
            }
            assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
          } catch (error) {
            exitError = error
          }
          if (
            !caseError &&
            !exitError &&
            (!gpu || gpu.error || !gpu.maximumMiB || gpu.samples < 1)
          ) {
            caseError = new Error('The owned worker must have at least one positive CUDA sample.')
          }
          const result = {
            case: testCase,
            error: caseError && errorText(caseError),
            exitError: exitError && errorText(exitError),
            gpu,
            output,
            owner,
            physicalExit,
            progress,
          }
          results.push(result)
          await retain(`${testCase.label}.outcome.json`, result)
        }
        if (caseError || exitError) {
          throw caseError ?? exitError
        }
        return output
      },
    })
    assert.equal(attempted, cases.length)
    assert.equal(submitted, cases.length)
    assert.equal(controls.size, img ? 1 : 2)
  } catch (error) {
    failure = error
  }

  let preservationError: unknown
  let memory: Record<string, string> | undefined
  try {
    await idle()
    assert.deepEqual(await regular(checkpoint), checkpointBefore)
    assert.deepEqual(await bytesAt(contractPath), contractBytes)
    for (const pin of enginePins) {
      await verify(pin)
    }
    assert.equal(await revision(repository), applicationRevision)
    assert.equal(await revision(invoke), invokeRevision)
    assert.deepEqual(await sourceHashes(repository, ownerFiles), source.files)
    assert.deepEqual(await sourceHashes(invoke, checkedInvokeFiles), source.invokeFiles)
    const measured = Object.fromEntries(
      await Promise.all(
        ['memory.peak', 'memory.events', 'memory.stat', 'memory.swap.peak'].map(async (name) => [
          name,
          (await readFile(`/sys/fs/cgroup${bounds.group}/${name}`, 'utf8')).trim(),
        ]),
      ),
    )
    assert.match(measured['memory.events'], /^oom_kill 0$/m)
    assert.equal(measured['memory.swap.peak'], '0')
    memory = measured
  } catch (error) {
    preservationError = error
  }
  await retain('native-report.json', {
    attempted,
    bounds,
    enginePins: engine.pinned.length,
    failure: failure && errorText(failure),
    memory,
    observations: results,
    outcome: failure || preservationError ? 'FAIL' : 'PASS',
    preservationError: preservationError && errorText(preservationError),
    runtimeId: engine.runtimeId,
    signedConfigPins: engine.configs.length,
    submitted,
    targetSha,
    visualStatus: 'PENDING_REVIEW',
  })
  if (failure || preservationError) {
    throw failure ?? preservationError
  }
}

if (import.meta.main) {
  await main()
}
