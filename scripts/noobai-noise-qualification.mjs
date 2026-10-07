/** Strict source/recipe guards and matched causal controls for the opt-in installed harness. */
import assert from 'node:assert/strict'
import path from 'node:path'

const cyberOrigin = {
  kind: 'civitai-trained',
  modelId: 1147756,
  versionId: 2679856,
  fileId: 2566634,
  url: 'https://civitai.com/api/download/models/2679856?fileId=2566634',
  modelApi: 'https://civitai.com/api/v1/models/1147756',
  versionApi: 'https://civitai.com/api/v1/model-versions/2679856',
  creator: 'Knightus_Ai',
  baseModel: 'NoobAI',
}
export const officialEpsilonIdentity = {
  sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
  byteSize: 6938040416,
  origin: {
    kind: 'civitai-trained',
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    url: 'https://civitai.com/api/download/models/1022833?fileId=928571',
    modelApi: 'https://civitai.com/api/v1/models/833294',
    versionApi: 'https://civitai.com/api/v1/model-versions/1022833',
    creator: 'L_A_X',
    baseModel: 'NoobAI',
  },
}
export const noiseModelKeys = ['illustrious', 'illustriousEpsilon', 'illustriousLora']
export const noiseStages = ['bounded', 'bounded-lifecycle', 'author', 'outpaint']
export const noiseAxes = ['prediction', 'zero-snr', 'spacing', 'sampler']
export const baselineNoiseProfile = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: true,
  timestepSpacing: 'leading',
}
export const epsilonNoiseProfile = { ...baselineNoiseProfile, rescaleBetasZeroSnr: false }
export const noiseRecipeSources = {
  illustrious: {
    sourceRevision: '66aa55e3469c27c29a89813cd35dd95fb7485fa1',
    sourceSha256: 'aaab159149a518c3366dd9da14798a64e3672a7147d67ff247582116f3624537',
    sourceUrl:
      'https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0/resolve/66aa55e3469c27c29a89813cd35dd95fb7485fa1/README.md',
  },
  illustriousEpsilon: {
    sourceRevision: '70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3',
    sourceSha256: '4359aa848981aa7f8c1a2e28f9b6a692f829a184f1995431630f9c1751e6fd87',
    sourceUrl:
      'https://huggingface.co/Laxhar/noobai-XL-1.0/resolve/70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3/README.md',
  },
}

function keys(value, expected, message) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), message)
}

export function assertNoiseReady(ready) {
  assert.equal(
    ready?.workerVersion,
    '0.14.0',
    'Noise-profile qualification requires installed worker0.14 before source copy.',
  )
  assert.equal(ready.protocolVersion, '1')
  assert.equal(ready.runtimeProfile, 'linux-nvidia')
  for (const capability of [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
  ]) {
    assert.ok(
      ready.capabilities?.includes(capability),
      `Noise-profile qualification requires ${capability} before source copy.`,
    )
  }
}

export function executionFor(modelKey, stage = 'bounded') {
  assert.ok(['illustrious', 'illustriousEpsilon'].includes(modelKey))
  assert.ok(noiseStages.includes(stage))
  return {
    width: stage === 'author' ? 832 : 256,
    height: stage === 'author' ? 1216 : 256,
    steps: stage === 'author' ? 28 : 3,
    cfgScale: 5,
    sampler: modelKey === 'illustrious' ? 'euler' : 'euler_a',
    scheduler: 'normal',
    predictionType: modelKey === 'illustrious' ? 'v_prediction' : 'epsilon',
    noiseProfile: structuredClone(
      modelKey === 'illustrious' ? baselineNoiseProfile : epsilonNoiseProfile,
    ),
  }
}

export function noiseStagePlan(stage) {
  assert.ok(noiseStages.includes(stage), 'A declared noise qualification stage is required.')
  const bounded = stage === 'bounded'
  const lifecycle = stage === 'bounded-lifecycle'
  return {
    completedScope: bounded
      ? '256px/three-step causal controls and frozen Retry only'
      : lifecycle
        ? '256px/three-step lifecycle only: source precondition, genuine epsilon txt2img/img2img, Cancel and three refused/restored frozen Retry axes; no matched trained pixel-control completion claim'
        : stage === 'author'
          ? 'Two explicit 832x1216/28-step trained recipe executions only'
          : 'Two explicit 256px/three-step ordinary mixed-alpha outpaint executions only',
    fullBoundedClaim: bounded,
    matchedTrainedPixelControlCases: bounded ? 5 : 0,
    expectedOutcome: {
      finiteCompletions: bounded ? 8 : lifecycle || stage === 'outpaint' ? 4 : 2,
      actualAdmissions: bounded ? 9 : lifecycle ? 5 : stage === 'outpaint' ? 4 : 2,
      canceledOriginals: bounded || lifecycle ? 1 : 0,
      preservingRetryRefusals: bounded || lifecycle ? 3 : 0,
    },
  }
}

/** Actual queue/completion counts cannot promote a partial lifecycle run to the full bounded claim. */
export function assertNoiseStageOutcome(summary) {
  const plan = noiseStagePlan(summary.stage)
  for (const [key, expected] of Object.entries(plan.expectedOutcome))
    assert.equal(
      summary[key],
      expected,
      `The declared ${summary.stage} stage must have exact ${key}.`,
    )
  assert.equal(summary.fullBoundedClaim, plan.fullBoundedClaim)
  assert.equal(summary.matchedTrainedPixelControlCases, plan.matchedTrainedPixelControlCases)
  assert.equal(summary.completedScope, plan.completedScope)
  assert.equal(summary.noCombinedMatrixClaim, true)
}

export function validateNoiseProfileFixture(fixture, ready) {
  assert.equal(fixture.profile, 'noise-profile')
  assert.equal(fixture.schemaVersion, 1)
  assert.ok(
    noiseStages.includes(fixture.stage),
    'Noise-profile qualification requires a declared bounded, bounded-lifecycle, author or outpaint stage.',
  )
  keys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'stage',
      'appData',
      'artifacts',
      'side',
      'steps',
      ...noiseModelKeys,
      'authorRecipes',
      ...(fixture.stage === 'outpaint' ? ['lama'] : []),
    ],
    'Noise-profile qualification accepts exactly three declared source identities and explicit recipes.',
  )
  assert.equal(
    fixture.side,
    256,
    'Noise-profile fixture baseline requires 256 pixels; author geometry is explicit per recipe.',
  )
  assert.equal(
    fixture.steps,
    3,
    'Noise-profile fixture baseline requires three steps; author steps are explicit per recipe.',
  )
  for (const key of noiseModelKeys) {
    const value = fixture[key]
    const checkpoint = key !== 'illustriousLora'
    keys(
      value,
      [
        'path',
        'sha256',
        'byteSize',
        'type',
        'family',
        'name',
        'versionName',
        ...(checkpoint ? ['predictionType', 'trainedObjective', 'origin'] : []),
      ],
      'Noise-profile source descriptor fields must be exact.',
    )
    assert.equal(value.type, checkpoint ? 'checkpoint' : 'lora')
    assert.equal(value.family, 'illustrious')
    assert.ok(
      path.isAbsolute(value.path) &&
        path.normalize(value.path) === value.path &&
        value.path.endsWith('.safetensors'),
    )
    assert.match(value.sha256, /^[a-f0-9]{64}$/)
    assert.ok(Number.isSafeInteger(value.byteSize) && value.byteSize > 0)
    for (const label of ['name', 'versionName'])
      assert.ok(
        typeof value[label] === 'string' &&
          value[label].trim() === value[label] &&
          value[label].length > 0,
      )
    if (checkpoint) {
      assert.equal(
        value.predictionType,
        null,
        'No qualification descriptor may seed a library override.',
      )
      assert.equal(value.trainedObjective, key === 'illustrious' ? 'v_prediction' : 'epsilon')
      assert.deepEqual(
        value.origin,
        key === 'illustrious' ? cyberOrigin : officialEpsilonIdentity.origin,
      )
    }
  }
  assert.equal(
    new Set(noiseModelKeys.map((key) => fixture[key].sha256)).size,
    3,
    'Two distinct trained checkpoint identities and an ordinary LoRA are required.',
  )
  assert.equal(fixture.illustriousEpsilon.sha256, officialEpsilonIdentity.sha256)
  assert.equal(fixture.illustriousEpsilon.byteSize, officialEpsilonIdentity.byteSize)
  keys(
    fixture.authorRecipes,
    ['illustrious', 'illustriousEpsilon'],
    'Two separate source-grounded recipe descriptors are required.',
  )
  for (const key of ['illustrious', 'illustriousEpsilon']) {
    const recipe = fixture.authorRecipes[key]
    keys(
      recipe,
      ['sourceUrl', 'sourceRevision', 'sourceSha256', 'attribution', 'assumedFields', 'execution'],
      'Author recipe requires exact source URL, revision, content SHA, attribution, assumptions and execution.',
    )
    assert.match(recipe.sourceRevision, /^[a-f0-9]{40}$/)
    assert.match(recipe.sourceSha256, /^[a-f0-9]{64}$/)
    for (const field of ['sourceRevision', 'sourceSha256'])
      assert.equal(
        recipe[field],
        noiseRecipeSources[key][field],
        'Author recipe source must match the independently pinned exact README snapshot.',
      )
    assert.ok(
      [
        noiseRecipeSources[key].sourceUrl,
        noiseRecipeSources[key].sourceUrl.replace('/resolve/', '/raw/'),
      ].includes(recipe.sourceUrl),
      'Author recipe URL must name the exact pinned README snapshot.',
    )
    assert.equal(
      recipe.attribution,
      key === 'illustrious' ? 'upstream-on-credited-derivative' : 'checkpoint-author',
    )
    assert.deepEqual(
      recipe.assumedFields,
      ['timestepSpacing'],
      'Unset source spacing is a declared assumption, never inferred from prediction or a marker name.',
    )
    assert.deepEqual(
      recipe.execution,
      executionFor(key, 'author'),
      'Declared author geometry/steps/CFG/sampler/objective/noise must match the source-grounded recipe.',
    )
  }
  assertNoiseReady(ready)
  return {
    stage: fixture.stage,
    modelKeys: [...noiseModelKeys],
    authorRecipes: structuredClone(fixture.authorRecipes),
    ...noiseStagePlan(fixture.stage),
  }
}

export function boundedNoiseCases() {
  const baseline = executionFor('illustrious')
  return [
    { axis: null, name: 'v-baseline', execution: baseline },
    {
      axis: 'prediction',
      name: 'v-epsilon-interpretation-control',
      execution: { ...structuredClone(baseline), predictionType: 'epsilon' },
    },
    {
      axis: 'zero-snr',
      name: 'v-zero-snr-off-control',
      execution: {
        ...structuredClone(baseline),
        noiseProfile: { ...baseline.noiseProfile, rescaleBetasZeroSnr: false },
      },
    },
    {
      axis: 'spacing',
      name: 'v-trailing-control',
      execution: {
        ...structuredClone(baseline),
        noiseProfile: { ...baseline.noiseProfile, timestepSpacing: 'trailing' },
      },
    },
    {
      axis: 'sampler',
      name: 'v-euler-a-control',
      execution: { ...structuredClone(baseline), sampler: 'euler_a' },
    },
  ]
}

/** Strip only project/operation/path identities; all semantic inputs remain until one named axis. */
export function normalizeNoiseInputs(frozen, axis = null) {
  assert.ok(
    axis === null || noiseAxes.includes(axis),
    'Only one declared matched-control axis may be normalized.',
  )
  const value = structuredClone({ context: frozen.context, workerJob: frozen.workerJob })
  delete value.context.documentId
  delete value.context.documentRevision
  delete value.workerJob.requestId
  for (const owner of [value.context.target, value.workerJob.target]) if (owner) delete owner.path
  if (value.workerJob.output) {
    delete value.workerJob.output.pngPath
    delete value.workerJob.output.thumbnailPath
  }
  if (axis === 'prediction') {
    delete value.context.model.reference.predictionType
    delete value.workerJob.checkpoint.predictionType
  } else if (axis === 'zero-snr') {
    delete value.context.sampling.noiseProfile.rescaleBetasZeroSnr
    delete value.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr
  } else if (axis === 'spacing') {
    delete value.context.sampling.noiseProfile.timestepSpacing
    delete value.workerJob.sampling.noiseProfile.timestepSpacing
  } else if (axis === 'sampler') {
    delete value.context.sampling.sampler
    delete value.context.sampling.invokeScheduler
    delete value.workerJob.sampling.scheduler
  }
  return value
}

export function assertNoiseExecution(frozen, execution) {
  assert.equal(frozen.context.sampling.steps, execution.steps)
  assert.equal(frozen.context.sampling.cfgScale, execution.cfgScale)
  assert.equal(frozen.context.sampling.invokeScheduler, execution.sampler)
  assert.equal(frozen.workerJob.sampling.scheduler, execution.sampler)
  assert.equal(frozen.workerJob.sampling.steps, execution.steps)
  assert.equal(frozen.workerJob.sampling.cfgScale, execution.cfgScale)
  assert.equal(frozen.context.model.reference.predictionType, execution.predictionType)
  assert.equal(frozen.workerJob.checkpoint.predictionType, execution.predictionType)
  assert.deepEqual(frozen.context.sampling.noiseProfile, execution.noiseProfile)
  assert.deepEqual(frozen.workerJob.sampling.noiseProfile, execution.noiseProfile)
  assert.equal(frozen.context.bbox.width, execution.width)
  assert.equal(frozen.context.bbox.height, execution.height)
}

/** Preload may coalesce progress events, but native txt2img must execute the requested steps. */
export function assertNoiseTxt2ImgProgress(progress, execution) {
  assert.ok(Number.isInteger(execution.steps) && execution.steps > 0)
  assert.ok(Array.isArray(progress) && progress.length > 0, 'Native txt2img must report progress.')
  for (const { current } of progress)
    assert.equal(
      current.totalSteps,
      execution.steps,
      'Every native txt2img progress event must report the requested execution step count.',
    )
  assert.equal(
    progress.at(-1).current.step,
    execution.steps,
    'Native txt2img completion must reach the requested execution step count.',
  )
}

/** Same family does not identify an accepted checkpoint: compare the exact selected file. */
export function assertAcceptedCheckpointIdentity(configuration, expectedCheckpoint) {
  assert.equal(expectedCheckpoint.type, 'checkpoint')
  assert.equal(configuration.model.baseModelFamily, expectedCheckpoint.family)
  assert.equal(
    configuration.model.fileSha256,
    expectedCheckpoint.sha256,
    'Saved accepted settings must retain the exact selected checkpoint, including a distinct same-family checkpoint.',
  )
}

export function assertNoiseCatalog(catalog, fixture, { adopting = false } = {}) {
  assert.ok(
    catalog.length === 3 || (adopting && catalog.length === 2),
    'Noise-profile qualification requires exactly its prior two or final three resource rows.',
  )
  assert.equal(catalog.flatMap(({ versions }) => versions).length, catalog.length)
  const allowed = new Map(noiseModelKeys.map((key) => [fixture[key].sha256, key]))
  const seen = new Set()
  for (const resource of catalog) {
    const version = resource.versions[0]
    const key = allowed.get(version.file.sha256)
    assert.ok(key && !seen.has(key), 'Catalog cannot adopt an undeclared or duplicate identity.')
    seen.add(key)
    const declared = fixture[key]
    assert.equal(resource.type, declared.type)
    assert.equal(resource.displayName, declared.name)
    assert.equal(resource.defaultVersionId, version.id)
    assert.equal(version.name, declared.versionName)
    assert.equal(version.file.sizeBytes, declared.byteSize)
    assert.equal(version.expectedSha256, declared.sha256)
    assert.equal(version.file.status, 'ready')
    assert.equal(version.format, 'safetensors')
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.file.originalFilename, path.basename(declared.path))
    assert.equal(
      version.file.managedPath,
      path.join(
        fixture.appData,
        'models',
        `qualified-${{ illustrious: 700_040, illustriousEpsilon: 700_140, illustriousLora: 700_060 }[key]}.safetensors`,
      ),
    )
    assert.deepEqual(version.dependencyVersionIds, {})
    if (key !== 'illustriousLora') {
      assert.deepEqual(resource.source, { kind: 'civitai', modelId: declared.origin.modelId })
      assert.equal(resource.creator, declared.origin.creator)
      assert.equal(version.civitaiVersionId, declared.origin.versionId)
      assert.equal(version.civitaiFileId, declared.origin.fileId)
      assert.deepEqual(resource.sourceMetadata.origin, declared.origin)
      assert.deepEqual(version.sourceMetadata.origin, declared.origin)
    } else {
      assert.deepEqual(resource.source, { kind: 'civitai', modelId: 700_060 })
      assert.equal(version.civitaiVersionId, 700_061)
      assert.equal(version.civitaiFileId, 700_062)
      assert.equal(version.predictionType, null)
    }
  }
  assert.ok(
    seen.has('illustrious') && seen.has('illustriousLora'),
    'The previous Cyberfalafel and LoRA rows must remain installed.',
  )
  if (!adopting || catalog.length === 3) assert.ok(seen.has('illustriousEpsilon'))
  return seen
}

/** Independent pinned native constructors compared to the installed production scheduler adapter. */
export const noiseScheduleOracleProgram = `import hashlib,json,sys,types
import diffusers,torch
from imagegen_worker.inference import select_inference_scheduler
executions=json.loads(sys.argv[1])
results=[]
for e in executions:
 p=e['noiseProfile']
 cls=diffusers.EulerDiscreteScheduler if e['sampler']=='euler' else diffusers.EulerAncestralDiscreteScheduler
 expected=cls(num_train_timesteps=1000,beta_start=0.00085,beta_end=0.012,beta_schedule='scaled_linear',steps_offset=1,timestep_spacing=p['timestepSpacing'],rescale_betas_zero_snr=p['rescaleBetasZeroSnr'],prediction_type=e['predictionType'])
 command=types.SimpleNamespace(prediction_type=e['predictionType'],scheduler=e['sampler'],seed=0,noise_profile=types.SimpleNamespace(timestep_spacing=p['timestepSpacing'],rescale_betas_zero_snr=p['rescaleBetasZeroSnr']))
 pipeline=types.SimpleNamespace(scheduler=types.SimpleNamespace(config={'num_train_timesteps':1000,'beta_start':0.002,'beta_end':0.02,'beta_schedule':'linear','steps_offset':7,'timestep_spacing':'linspace'}))
 actual=select_inference_scheduler(command,pipeline,types.SimpleNamespace(diffusers=diffusers))
 assert type(actual) is cls, 'Installed production Euler dispatch differs from independent native class'
 actual.set_timesteps(e['steps']); expected.set_timesteps(e['steps'])
 hashes={}
 for name in ('betas','alphas_cumprod','timesteps','sigmas'):
  a=getattr(actual,name).cpu(); b=getattr(expected,name).cpu()
  assert torch.equal(a,b), 'Installed production noise schedule differs from independent native '+name
  assert bool(torch.isfinite(a).all()), 'Independent native schedule must remain finite'
  hashes[name]=hashlib.sha256(a.numpy().tobytes()).hexdigest()
 results.append({'execution':e,'nativeClass':cls.__name__,'hashes':hashes,'timesteps':actual.timesteps.tolist(),'terminalAlpha':actual.alphas_cumprod[-1].item(),'terminalSigma':actual.sigmas[-1].item(),'productionEqualsIndependentNative':True})
print(json.dumps({'diffusersVersion':diffusers.__version__,'torchVersion':torch.__version__,'results':results}))`
