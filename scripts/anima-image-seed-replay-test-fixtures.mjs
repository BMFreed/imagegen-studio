/** Actual Main rows/configs with explicit report/DOM/RGBA doubles; no original native crypto claim. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  authoring,
  installedFixture,
  produced,
  resource,
} from './anima-image-seed-replay-main-fixtures.mjs'
import {
  literalAnimaImageSeedReplayPlan,
  resolveAnimaImageSeedReplayPlan,
} from './anima-image-seed-replay-qualification.mjs'
export { installedFixture, produced, resource }
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/anima-image-seed-replay-unit',
)
export const testBaseSeed = 2147483664
export function envelope(stage = 'random', mode = 'img2img', baseSeed = testBaseSeed) {
  return {
    schemaVersion: 1,
    profile: 'anima-image-seed-replay',
    stage,
    mode,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    sourceImage: {
      path: path.join(root, 'source.png'),
      byteSize: 47531,
      sha256: '09c8ed1b33eab4cc4c888c913d3493567f4effee704912ddbb3660833a8a9f93',
      pixelSha256: '5f00528166a030db5c8f33de22d1bf9707def9e3edadb079aa426dd3232b4100',
    },
    ...(mode === 'outpaint'
      ? {
          lamaSource: {
            path: path.join(root, 'lama.pt'),
            byteSize: 205669692,
            sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
          },
        }
      : {}),
    ...(stage === 'replay'
      ? {
          replaySeed: baseSeed,
          baseline: {
            reportPath: path.join(root, `random-${mode}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
    artifacts: path.join(root, `${stage}-${mode}`),
  }
}
export function authored(stage = 'random', mode = 'img2img', baseSeed = testBaseSeed) {
  const reference = installedFixture()
  return {
    reference,
    fixture: envelope(stage, mode, baseSeed),
    plan: literalAnimaImageSeedReplayPlan(stage, mode, stage === 'random' ? null : baseSeed),
    draft: authoring(reference, stage, mode, baseSeed),
  }
}
export function generations(actual, plan, accepted = true) {
  return actual.rows.map((row, index) => ({
    queueItemId: row.id,
    expectedItem: plan.items[index],
    frozen: JSON.parse(row.frozen_payload_json),
    row: { status: 'completed' },
    accepted,
    provenance: { generationConfiguration: actual.configs[index] },
    dimensions: {
      pixelSha256: createHash('sha256').update(`explicit-not-native:${index}`).digest('hex'),
    },
  }))
}
export function retainedBaseline(actual, mode) {
  const literalPlan = literalAnimaImageSeedReplayPlan('random', mode),
    plan = resolveAnimaImageSeedReplayPlan(literalPlan, actual.rows)
  return {
    status: 'passed',
    profile: 'anima-image-seed-replay',
    stage: 'random',
    literalPlan,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    seedAdmissionObservation: {
      producer: 'Main node:crypto.randomBytes(4).readUInt32LE(0)',
      outputSubstitution: false,
      originalIdentityRestored: true,
      firstAdmittedQueueItemId: actual.rows[0].id,
      calls: [
        {
          seed: plan.baseSeed,
          argumentCount: 1,
          byteSize: 4,
          synchronous: true,
          stack: 'Declared peer of prepareAnimaGenerationInternal; not a native observation',
        },
      ],
    },
    savedPackage: {
      acceptedLayers: 8,
      sourceLayers: 1,
      totalLayers: 9,
      reopened: true,
      lastActualSeedSnapshot: plan.items.at(-1).seed,
    },
    admissions: actual.rows.map((row) => ({ row })),
    generations: generations(actual, plan),
    comparisons: actual.rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
  }
}
export function pixelGenerations(actual, plan) {
  return generations(actual, plan).map((generation, index) => {
    const rgba = Buffer.alloc(65536 * 4)
    for (let pixel = 0; pixel < 65536; pixel++) {
      const x = pixel % 256,
        alpha = plan.mode === 'img2img' ? 255 : x < 153 ? 0 : x < 168 ? 128 : 255
      rgba.set([10 + index * 3, 20 + index * 5, 30 + index * 7, alpha], pixel * 4)
    }
    return { ...generation, rgba }
  })
}
const description = (entry) =>
  `Enabled · ${entry.resource.displayName} · ${entry.resource.versionName}\nSHA-256 ${entry.resource.fileSha256}\nWeight ${entry.weight}`
/** DOM peer fed by a caller-supplied independently resolved literal item, not an actual UI. */
export function comparisonInput(scope, item) {
  const { fixture, reference } = scope,
    currentDraft = structuredClone(scope.draft)
  currentDraft.seed = { policy: 'fixed', value: 37 }
  currentDraft.dynamicPrompt = { maxPrompts: 3, seedBehavior: 'per-iteration' }
  currentDraft.sampling.animaMethod = 'heun'
  currentDraft.sampling.denoisingStrength = 0.5
  currentDraft.loras[0].weight = -0.25
  currentDraft.positivePrompt = {
    embeddingRefs: [],
    text: 'a (green:1.1) glass bowl, later authoring edit',
  }
  currentDraft.negativePrompt = { embeddingRefs: [], text: '(grainy:0.8), later authoring edit' }
  const values = {
    'sampling.animaMethod': ['Euler', 'Heun'],
    'context.mode': [item.mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['4', '4'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': [String(item.seed), '37'],
    'seed.policy': [item.requestedSeedPolicy, 'fixed'],
    'seed.behavior': ['per-prompt', 'per-iteration'],
    'prompt.text': [item.prompts.positive, currentDraft.positivePrompt.text],
    'negativePrompt.text': [item.prompts.negative, currentDraft.negativePrompt.text],
    'prompt.embeddings': ['None', 'None'],
    'negativePrompt.embeddings': ['None', 'None'],
    'loras.stack': [description(scope.draft.loras[0]), description(currentDraft.loras[0])],
  }
  const rows = Object.fromEntries(
      Object.entries(values).map(([key, entries]) => [
        key,
        { key, values: entries, status: entries[0] === entries[1] ? 'Same' : 'Changed' },
      ]),
    ),
    seen = []
  const dialog = {
    locator(selector) {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(rows[key], `Unexpected row ${selector}`)
      return {
        ...rows[key],
        locator(child) {
          assert.equal(child, '.comparison-values p')
          return { ...rows[key], allTextContents: async () => rows[key].values }
        },
      }
    },
  }
  const expect = (row) => ({
    toHaveCount: async (count) => assert.equal(count, 1),
    toHaveAttribute: async (attribute, status) => {
      assert.equal(attribute, 'data-status')
      assert.equal(row.status, status)
      seen.push(row.key)
    },
    toHaveText: async (entries) => assert.deepEqual(row.values, entries),
  })
  return {
    rows,
    seen,
    context: {
      fixture,
      reference,
      currentDraft,
      generation: { expectedItem: item },
      dialog,
      expect,
    },
  }
}
