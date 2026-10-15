/** Real Main capture -> typed transport -> trained local CPU LaMa; no diffusion or UI. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectAutosaveLeaseRegistry } from '../src/main/projects/project-autosave.ts'
import { ProjectIndexRepository } from '../src/main/projects/project-index.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { readProjectPlaceholders } from '../src/main/projects/project-placeholders.ts'
import { ProjectService } from '../src/main/projects/project-service.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import {
  composeTargetWithTransport,
  conditionSmartPatchWithTransport,
  prepareSmartPatchModelSourceWithTransport,
  prepareSmartPatchWithTransport,
} from '../src/main/projects/worker-client.ts'
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { SMART_PATCH_DEFAULT_COHERENCE_SETTINGS } from '../src/shared/projects/smart-patch-coherence-settings.ts'

const root = path.resolve(import.meta.dirname, '..')
const arguments_ = process.argv.slice(2)
assert.equal(arguments_.length, 6, 'Use --python ABS --lama ABS --output NEW_OWNED_RUN_DIR')
assert.deepEqual([arguments_[0], arguments_[2], arguments_[4]], ['--python', '--lama', '--output'])
const [python, lama, output] = [arguments_[1], arguments_[3], arguments_[5]]
for (const supplied of [python, lama, output]) {
  assert.ok(
    path.isAbsolute(supplied) && path.resolve(supplied) === supplied,
    'Explicit canonical absolute paths required',
  )
}
assert.equal(existsSync(output), false, 'Output directory must be new')
assert.equal(await realpath(path.dirname(output)), path.dirname(output))
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, output)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.ok((await lstat(python)).isFile() || (await lstat(python)).isSymbolicLink())
assert.equal(
  await realpath(lama),
  lama,
  'Existing trained weights must be canonical, without symlink aliases',
)
assert.ok((await lstat(lama)).isFile())
assert.equal(path.basename(lama), LAMA_OUTPAINT_ARTIFACT.filename)
assert.equal((await lstat(lama)).size, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
await mkdir(output, { mode: 0o700 })
const payload = await mkdtemp(path.join(output, 'main-source-payload-'))
const reportPath = path.join(output, 'report.json')
const lifecyclePath = path.join(output, 'artifact-lifecycle.json')
const sourceRoot = path.join(root, 'worker-python/src')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const execute = promisify(execFile)
const sourceFiles = [
  'scripts/smoke-smart-patch-model-source.mjs',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-smart-patch-generation-input.ts',
  'src/main/projects/project-smart-patch-preparation.ts',
  'src/main/projects/worker-client.ts',
  'src/main/runtime/inference-auxiliary-resources.ts',
  'src/main/runtime/lama-manifest.ts',
  'worker-python/src/imagegen_worker/protocol.py',
  'worker-python/src/imagegen_worker/lama_infill.py',
  'worker-python/src/imagegen_worker/smart_patch_model_source.py',
]
const sourceHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [file, digest(await readFile(path.join(root, file)))]),
    ),
  )
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  boundary:
    'Actual ProjectService/import/writer/SQLite/capture -> actual typed CPU transport -> current Python protocol -> exact installed trained CPU LaMa -> strict Main RGB consumer; no Electron, diffusion, GPU, queue or acceptance.',
  preconditions:
    'Writer builds two tiny input-only projects with Raster below and red Raster above Patch. Authored mask is disjoint from alpha holes. No expected result or infill pixels are supplied by the fixture.',
  limitations:
    'The separate trained Python/Invoke oracle qualifies numerical parity. This probe qualifies genuine Main data flow, shared resource ownership, immutable inputs and storage/lease effects.',
  python,
  lama,
  output,
  payloads: [payload],
  sourceSha256: await sourceHashes(),
  processes: [],
  requests: [],
  checks: [],
  cases: [],
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-model-source-main', run: output },
  state: 'running',
  lastUsedAt: new Date().toISOString(),
  evidence: [reportPath],
  payloads: [payload],
  dependsOn: [python, lama, sourceRoot],
  pins: [
    {
      path: output,
      reason:
        'Retain compact Main/CPU trained-source integration evidence; disposable project payload releases after physical exit and unchanged-state assertions.',
    },
  ],
}
async function checkpoint() {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  await writeFile(lifecyclePath, JSON.stringify(lifecycle, null, 2) + '\n', { mode: 0o600 })
}
async function check(name, details = {}) {
  report.checks.push({ name, ...details })
  await checkpoint()
  console.log(`PASS ${name}`)
}

// This adapter calls the current production protocol. Pillow decodes observations
// independently; it computes no expected crop, conditioning, holes or infill pixels.
const program = String.raw`
import base64, hashlib, json, os, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from PIL import Image
from imagegen_worker.protocol import process_request
from imagegen_worker import compositor, smart_patch_preparation, smart_patch_conditioning, smart_patch_model_source, lama_infill
envelope=json.loads(sys.stdin.read())
request=envelope['request']
samples=[(8,8),(96,48),(104,48),(112,48),(127,127)]
def observe(file):
    if file is None: return None
    content=Path(file).read_bytes()
    with Image.open(file) as image:
        image.load()
        rgba=image.convert('RGBA')
        rgb=image.convert('RGB')
        return {'path':file,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content),'format':image.format,'mode':image.mode,'size':list(image.size),'iccSha256':hashlib.sha256(image.info['icc_profile']).hexdigest() if image.info.get('icc_profile') else None,'rgbaSha256':hashlib.sha256(rgba.tobytes()).hexdigest(),'rgbSha256':hashlib.sha256(rgb.tobytes()).hexdigest(),'alphaSha256':hashlib.sha256(rgba.getchannel('A').tobytes()).hexdigest(),'samples':[list(rgba.getpixel(point)) for point in samples if point[0]<image.width and point[1]<image.height]}
before=observe(request.get('source',{}).get('path')) if request.get('source') else None
response=process_request(request)
after=observe(request.get('source',{}).get('path')) if request.get('source') else None
paths={}
if request['type']=='compose-target': paths={'source':request['output']['targetPngPath']}
elif request['type']=='prepare-smart-patch': paths={key:request['output'][name] for key,name in [('worldMask','worldMaskPngPath'),('processingMask','processingMaskPngPath'),('processingSource','processingSourcePngPath')]}
elif request['type']=='condition-smart-patch': paths={key:request['output'][key+'PngPath'] for key in ['worldKeepMask','processingKeepMask','latentKeepMask','expandedProcessingKeepMask','expandedWorldKeepMask','finalContributionMask']}
elif request['type']=='prepare-smart-patch-model-source' and request['output']['modelSourcePngPath']: paths={'modelSource':request['output']['modelSourcePngPath']}
print(json.dumps({'pid':os.getpid(),'response':response,'sourceBefore':before,'sourceAfter':after,'decoded':{key:observe(file) for key,file in paths.items() if Path(file).is_file()},'modulePaths':{module.__name__:str(Path(module.__file__).resolve()) for module in [compositor,smart_patch_preparation,smart_patch_conditioning,smart_patch_model_source,lama_infill]},'pythonVersion':sys.version.split()[0],'torchVersion':sys.modules['torch'].__version__ if 'torch' in sys.modules else None,'loadedDiffusionModules':[name for name in ['diffusers','transformers','compel'] if name in sys.modules]}))
`

async function processStart(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null
    throw error
  }
}
async function physicalExit(pid, startTicks) {
  const current = await processStart(pid)
  return current === null || (startTicks !== null && current !== startTicks)
}
async function request(type, value, expectedType) {
  const record = {
    type,
    pid: null,
    startTicks: null,
    closed: false,
    code: null,
    signal: null,
    physicalExit: false,
  }
  report.processes.push(record)
  const execution = execute(python, ['-I', '-B', '-c', program, sourceRoot], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120_000,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '',
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      NUMEXPR_NUM_THREADS: '1',
    },
  })
  record.pid = execution.child.pid
  execution.child.once('close', (code, signal) => {
    record.closed = true
    record.code = code
    record.signal = signal
  })
  record.startTicks = await processStart(record.pid)
  assert.ok(
    record.startTicks,
    'Physical subprocess identity is captured before its input is released',
  )
  execution.child.stdin.end(
    JSON.stringify({ request: { ...value, type, protocolVersion: '1', requestId: randomUUID() } }),
  )
  let stdout, stderr
  try {
    ;({ stdout, stderr } = await execution)
  } finally {
    record.physicalExit = record.pid ? await physicalExit(record.pid, record.startTicks) : true
    await checkpoint()
  }
  assert.equal(
    record.closed,
    true,
    'Protocol subprocess must physically close before the next stage',
  )
  assert.equal(record.code, 0)
  assert.equal(record.physicalExit, true)
  const observed = JSON.parse(stdout)
  assert.equal(observed.pid, record.pid)
  assert.equal(observed.response.type, expectedType, JSON.stringify(observed.response))
  assert.deepEqual(
    observed.sourceAfter,
    observed.sourceBefore,
    'Actual worker cannot rewrite its frozen source',
  )
  assert.deepEqual(observed.loadedDiffusionModules, [])
  for (const modulePath of Object.values(observed.modulePaths)) {
    assert.ok(
      modulePath.startsWith(sourceRoot + path.sep),
      'Current checkout production modules required',
    )
  }
  report.requests.push({ type, request: structuredClone(value), ...observed, stderr })
  await checkpoint()
  return observed.response
}

function sourcePng(profile, width, height, rgba) {
  const chunk = (name, bytes) => {
    const result = Buffer.alloc(bytes.length + 12)
    result.writeUInt32BE(bytes.length)
    result.write(name, 4, 'ascii')
    bytes.copy(result, 8)
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
    return result
  }
  assert.equal(rgba.length, width * height * 4)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++)
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function raster(bytes, bbox, name) {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bbox.height,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bbox.width,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
    visible: true,
  }
}
async function snapshot(fixture) {
  return {
    packageSha256: digest(await readFile(fixture.packagePath)),
    document: structuredClone(fixture.service.getOpenDocumentForAcceptance(fixture.tabId).document),
    tabs: structuredClone(fixture.service.getOpenTabs()),
    queue: await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
    receipts: await fixture.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute(),
    seed: await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    shadow: await fixture.shadow.inspect({
      projectPath: fixture.packagePath,
      savedPackage: await readIgsPackage(fixture.packagePath),
    }),
  }
}
async function entries(directory) {
  try {
    return await readdir(directory)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
async function fixture(mode, use) {
  const directory = path.join(payload, mode)
  await mkdir(directory, { mode: 0o700 })
  const database = openAppDatabase(directory, path.join(root, 'src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(directory, 'autosave'))
  const scratch = path.join(directory, 'scratch')
  const placeholdersDir = path.join(root, 'src/main/projects/placeholders')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: directory,
    repository,
    roots: { placeholdersDir, scratchDir: scratch },
    shadow,
  })
  try {
    const bbox = { height: 128, width: 128, x: -32, y: 16 }
    const profile = await readFile(path.join(sourceRoot, 'imagegen_worker/srgb.icc'))
    assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
    const rgba = Buffer.alloc(128 * 128 * 4)
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const alpha =
          mode === 'outpaint' && y >= 48 && y < 64 && x >= 96 && x < 120
            ? x < 104
              ? 0
              : x < 112
                ? 128
                : 254
            : 255
        rgba.set([32, 64, 96, alpha], (y * 128 + x) * 4)
      }
    }
    const sourceBytes = sourcePng(profile, 128, 128, rgba)
    const redBytes = sourcePng(
      profile,
      128,
      128,
      Buffer.from(Array.from({ length: 128 * 128 }, () => [255, 0, 0, 255]).flat()),
    )
    const source = raster(sourceBytes, bbox, 'Only lower Raster is source')
    const above = raster(redBytes, bbox, 'Excluded red Raster above Patch')
    const document = createEmptyProjectDocumentV1({ title: `Real private model-source ${mode}` })
    document.primaryBbox = { ...bbox }
    document.lastActualSeedSnapshot = 0
    const maskBytes =
      mode === 'outpaint'
        ? encodeProjectMaskPng(
            Uint8Array.from({ length: 16 * 16 }, () => 255),
            16,
            16,
          )
        : null
    const maskId = randomUUID()
    const mask = maskBytes
      ? {
          asset: {
            bytes: maskBytes.length,
            height: 16,
            path: `assets/masks/${maskId}/${digest(maskBytes)}.png`,
            sha256: digest(maskBytes),
            width: 16,
          },
          bounds: { height: 16, width: 16, x: bbox.x + 8, y: bbox.y + 8 },
          id: maskId,
          revision: 3,
        }
      : { asset: null, id: maskId, revision: 0 }
    const patch = {
      activeRasterSubLayerId: null,
      blendMode: 'normal',
      boundingBox: { ...bbox },
      coherenceSettings: { ...SMART_PATCH_DEFAULT_COHERENCE_SETTINGS },
      generationDraft: structuredClone(document.generationDraft),
      id: randomUUID(),
      internalResolution: { height: 128, width: 128 },
      kind: 'smart-patch',
      locked: false,
      mask,
      maskSettings: { blur: 16, padding: 8 },
      name: 'Frozen source owner',
      opacity: 1,
      rasterSubLayers: [],
      visible: true,
    }
    patch.generationDraft.seed = { policy: 'fixed', value: 0 }
    patch.generationDraft.positivePrompt.text = 'No inference in source preparation'
    document.layers = [above, patch, source]
    const externalPath = path.join(directory, 'input.igs')
    await saveIgsPackage(externalPath, {
      assets: {
        [above.asset.path]: { bytes: redBytes },
        [source.asset.path]: { bytes: sourceBytes },
        ...(maskBytes ? { [mask.asset.path]: { bytes: maskBytes } } : {}),
      },
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
        rect: bbox,
        status: 'unavailable',
      },
      project: document,
    })
    const selected = await service.selectImport(externalPath)
    assert.equal(selected.kind, 'transfer-required')
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    const packagePath = (await repository.listProjects())[0].canonicalPath
    await use({
      bbox,
      database,
      maskBytes,
      packagePath,
      patch,
      scratch,
      service,
      shadow,
      source,
      sourceBytes,
      tabId: imported.result.tab.id,
    })
  } finally {
    for (const tab of service.getOpenTabs()) await service.discardAndClose(tab.id)
    await database.close()
  }
}

async function runCase(mode) {
  await fixture(mode, async (f) => {
    const before = await snapshot(f)
    const requestStart = report.requests.length
    let resolverCalls = 0
    const resources = new InferenceAuxiliaryResources(path.dirname(lama))
    const resolver = {
      async resolveVerifiedOutpaintInfill() {
        resolverCalls++
        assert.equal(mode, 'outpaint', 'Ordinary IMG cannot resolve LaMa')
        const verified = await resources.resolveVerifiedOutpaintInfill()
        assert.equal(verified.managedPath, lama)
        return verified
      },
    }
    const worker = {
      composeTarget: (input) =>
        composeTargetWithTransport(input, f.scratch, (value) =>
          request('compose-target', value, 'target-done'),
        ),
      prepareSmartPatch: (input) =>
        prepareSmartPatchWithTransport(input, f.scratch, (value) =>
          request('prepare-smart-patch', value, 'smart-patch-prepared'),
        ),
      conditionSmartPatch: (input) =>
        conditionSmartPatchWithTransport(input, f.scratch, (value) =>
          request('condition-smart-patch', value, 'smart-patch-conditioned'),
        ),
      async prepareSmartPatchModelSource(input) {
        assert.equal(input.mode, mode)
        assert.equal(input.source.path, path.join(input.stagingRoot, 'processing-source.png'))
        const original = await readFile(input.source.path)
        assert.equal(digest(original), input.source.sha256)
        assert.equal(original.length, input.source.byteSize)
        assert.equal(
          original[25],
          6,
          'LaMa/model source input is original RGBA, not a numerical mask',
        )
        const result = await prepareSmartPatchModelSourceWithTransport(input, f.scratch, (value) =>
          request('prepare-smart-patch-model-source', value, 'smart-patch-model-source-prepared'),
        )
        assert.ok(
          (await readFile(input.source.path)).equals(original),
          'Source stage does not overwrite the original processing RGBA',
        )
        return result
      },
    }
    const result = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        capture.context.bbox.x = 999
        capture.context.coherenceSettings.edgeSize = 0
        capture.document.layers = []
        capture.maskPngBytes?.fill(0)
        return capture.prepareModelSource(worker, resolver)
      },
    )
    assert.equal(result.mode, mode)
    assert.equal(resolverCalls, mode === 'outpaint' ? 1 : 0)
    assert.deepEqual(result.context.bbox, f.bbox)
    assert.deepEqual(result.context.coherenceSettings, SMART_PATCH_DEFAULT_COHERENCE_SETTINGS)
    assert.deepEqual(result.coherence, SMART_PATCH_DEFAULT_COHERENCE_SETTINGS)
    assert.deepEqual(result.context.sourceLayerIds, [f.source.id])
    assert.equal(result.context.lastActualSeedSnapshot, 0)
    assert.ok(result.modelSource)
    assert.equal(result.modelSource.sha256, digest(result.modelSource.bytes))
    assert.equal(result.modelSource.iccSha256, IGS_SRGB_ICC_SHA256)
    assert.deepEqual([result.modelSource.bytes[24], result.modelSource.bytes[25]], [8, 2])
    const requests = report.requests.slice(requestStart)
    assert.deepEqual(
      requests.map((entry) => entry.type),
      [
        'compose-target',
        'prepare-smart-patch',
        'condition-smart-patch',
        'prepare-smart-patch-model-source',
      ],
    )
    const sourceRequest = requests.at(-1)
    assert.equal(sourceRequest.sourceBefore.sha256, result.processingSource.sha256)
    assert.equal(sourceRequest.sourceBefore.mode, 'RGBA')
    assert.deepEqual(sourceRequest.sourceBefore.size, [128, 128])
    assert.deepEqual(
      sourceRequest.sourceBefore.samples[0],
      [32, 64, 96, 255],
      'Upper red Raster and authored mask cannot replace the lower Raster source',
    )
    const model = sourceRequest.decoded.modelSource
    assert.equal(model.mode, 'RGB')
    assert.equal(model.sha256, result.modelSource.sha256)
    assert.deepEqual(model.size, [128, 128])
    assert.equal(model.iccSha256, IGS_SRGB_ICC_SHA256)
    if (mode === 'outpaint') {
      assert.ok(result.maskPngBytes.equals(f.maskBytes))
      assert.deepEqual(
        sourceRequest.sourceBefore.samples.slice(1, 4).map((sample) => sample[3]),
        [0, 128, 254],
      )
      assert.equal(typeof sourceRequest.torchVersion, 'string', 'Actual trained OUT imports Torch')
      assert.notEqual(
        model.rgbSha256,
        sourceRequest.sourceBefore.rgbSha256,
        'Trained OUT performs an actual model forward',
      )
    } else {
      assert.equal(result.maskPngBytes, null)
      assert.equal(sourceRequest.torchVersion, null)
      const literal = Buffer.from(Array.from({ length: 128 * 128 }, () => [32, 64, 96]).flat())
      assert.equal(model.rgbSha256, digest(literal), 'Ordinary IMG retains literal RGB pixels')
      assert.ok(requests.every((entry) => entry.torchVersion === null))
    }
    const sixMasks = Object.fromEntries(
      Object.entries(result.conditioning)
        .filter(([name]) => name !== 'latentMaskHasCoverage')
        .map(([name, plane]) => {
          assert.equal(plane.sha256, digest(plane.bytes))
          return [
            name,
            {
              sha256: plane.sha256,
              bytes: plane.bytes.length,
              width: plane.width,
              height: plane.height,
              polarity: plane.polarity,
            },
          ]
        }),
    )
    assert.equal(Object.keys(sixMasks).length, 6)
    for (const name of Object.keys(sixMasks)) {
      const plane = result.conditioning[name]
      await writeFile(path.join(output, `${mode}-${name}.png`), plane.bytes, {
        flag: 'wx',
        mode: 0o600,
      })
    }
    await writeFile(
      path.join(output, `${mode}-processing-source.png`),
      result.processingSource.bytes,
      { flag: 'wx', mode: 0o600 },
    )
    await writeFile(path.join(output, `${mode}-model-source.png`), result.modelSource.bytes, {
      flag: 'wx',
      mode: 0o600,
    })
    await writeFile(path.join(output, `${mode}-world-source.png`), result.source.bytes, {
      flag: 'wx',
      mode: 0o600,
    })
    const after = await snapshot(f)
    assert.deepEqual(
      after,
      before,
      'Source preparation cannot change document/history/saved package/shadow/seed/queue/receipts',
    )
    assert.deepEqual(
      await entries(f.scratch),
      [],
      'The completed capture deletes all operation staging',
    )
    assert.deepEqual(after.queue, [])
    assert.deepEqual(after.receipts, [])
    assert.deepEqual(after.seed, [])
    report.cases.push({
      mode,
      resolverCalls,
      sourceLayerIds: result.context.sourceLayerIds,
      coherence: result.coherence,
      latentMaskHasCoverage: result.conditioning.latentMaskHasCoverage,
      exactSourceHashes: {
        fixtureRasterPng: digest(f.sourceBytes),
        authoredMaskPng: f.maskBytes ? digest(f.maskBytes) : null,
        worldRgbaPng: result.source.sha256,
        processingRgbaPng: result.processingSource.sha256,
        modelRgbPng: result.modelSource.sha256,
        modelRawRgb: model.rgbSha256,
      },
      sixMasks,
      modelDecoded: model,
      savedPackageSha256: before.packageSha256,
      statePreserved: true,
      scratchEmpty: true,
    })
    await check(
      `${mode}: actual Main/typed worker source, immutable storage and complete lease cleanup`,
      { resolverCalls, modelRgbSha256: result.modelSource.sha256 },
    )
  })
}

async function allocated(directory) {
  let bytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    const stat = await lstat(file)
    assert.equal(
      stat.isSymbolicLink(),
      false,
      'Owned payload cleanup never follows external symlinks',
    )
    bytes += stat.blocks * 512
    if (stat.isDirectory()) bytes += await allocated(file)
  }
  return bytes
}
await checkpoint()
try {
  await runCase('outpaint')
  await runCase('img2img')
  assert.deepEqual(await sourceHashes(), report.sourceSha256)
  assert.ok(
    report.processes.every((entry) => entry.closed && entry.code === 0 && entry.physicalExit),
  )
  for (const entry of report.processes)
    assert.equal(await physicalExit(entry.pid, entry.startTicks), true)
  report.reclaimedAllocatedBytes = await allocated(payload)
  await rm(payload, { recursive: true })
  assert.equal(existsSync(payload), false)
  report.removedPayloads = [payload]
  report.payloads = []
  report.outcome = 'passed'
  report.finishedAt = new Date().toISOString()
  lifecycle.payloads = []
  lifecycle.state = 'retained'
  lifecycle.lastUsedAt = report.finishedAt
  await check(
    'All protocol subprocesses exited; source hashes unchanged; owned project payload reclaimed',
  )
} catch (error) {
  report.outcome = 'failed'
  report.finishedAt = new Date().toISOString()
  report.error =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : String(error)
  lifecycle.state = 'retained'
  lifecycle.lastUsedAt = report.finishedAt
  await checkpoint()
  throw error
}
