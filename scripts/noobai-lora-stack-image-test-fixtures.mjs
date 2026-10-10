/** Test-only exact authoring preconditions; never supplies an already prepared production object. */
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/lora-image-oracle-mechanics',
)
export function installedFixture() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const fields = {
    illustrious: [
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      'checkpoint',
      1147756,
      2679856,
      2566634,
    ],
    illustriousEpsilon: [
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      'checkpoint',
      833294,
      1022833,
      928571,
    ],
    illustriousLora: [
      700060,
      114437420,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      'lora',
      700060,
      700061,
      700062,
    ],
    illustriousLoraSecond: [
      700150,
      171540060,
      '90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca',
      'lora',
      1795307,
      2031703,
      1934353,
    ],
    externalVaeNative: [
      700080,
      167335542,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      'vae',
      700070,
      700081,
      700082,
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(fields).map(
        ([key, [id, byteSize, sha256, type, modelId, versionId, fileId]]) => [
          key,
          {
            byteSize,
            sha256,
            type,
            family: 'illustrious',
            name: key === 'illustriousLoraSecond' ? 'Lineless Digital Painting' : `Fixture ${key}`,
            versionName:
              key === 'illustriousLoraSecond'
                ? 'Lineless Digital Painting Style'
                : 'Qualified version',
            origin:
              key === 'illustriousLoraSecond'
                ? {
                    kind: 'civitai-trained',
                    modelId,
                    versionId,
                    fileId,
                    url: 'https://civitai.com/api/download/models/2031703?fileId=1934353',
                    creator: 'Underdorks',
                    creditRequired: true,
                  }
                : { modelId, versionId, fileId },
            ...(key === 'illustriousEpsilon'
              ? { trainedObjective: 'epsilon' }
              : key === 'illustrious'
                ? { trainedObjective: 'v_prediction' }
                : {}),
            installed: {
              resourceId: randomUUID(),
              versionId: randomUUID(),
              managedPath: path.join(appData, 'models', `qualified-${id}.safetensors`),
            },
          },
        ],
      ),
    ),
  }
}
export function resource(fixture, key) {
  const source = fixture[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: source.origin.fileId,
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType:
      key === 'illustriousEpsilon' ? 'epsilon' : key === 'illustrious' ? 'v_prediction' : null,
    versionName: source.versionName,
  }
}
/** Independent authoring input: the oracle does not supply this producer stack. */
export function authoredStack(fixture, choice) {
  const a = { enabled: true, resource: resource(fixture, 'illustriousLora'), weight: -0.5 }
  const b = {
    enabled: choice !== 'b-disabled',
    resource: resource(fixture, 'illustriousLoraSecond'),
    weight: choice === 'b-zero' ? 0 : 0.75,
  }
  return choice === 'ba' ? [b, a] : [a, b]
}
