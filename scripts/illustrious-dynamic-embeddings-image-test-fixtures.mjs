/** Explicit report/DOM/pixel doubles built around actual Main rows; never an ML/Save claim. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { installedEnvelope } from './illustrious-dynamic-image-test-fixtures.mjs'
import {
  authoring,
  installedFixture,
  produced,
  resource,
} from './illustrious-dynamic-embeddings-image-main-fixtures.mjs'
import { literalIllustriousDynamicEmbeddingsImagePlan } from './illustrious-dynamic-embeddings-image-qualification.mjs'
export { installedFixture, produced, resource }
export function envelope(stage = 'baseline', objective = 'epsilon', mode = 'img2img') {
  const base = installedEnvelope('baseline', objective, mode)
  return {
    ...base,
    profile: 'illustrious-dynamic-embeddings-image',
    stage,
    artifacts: base.artifacts.replace('baseline-', stage + '-'),
    ...(stage === 'prefix'
      ? {
          baseline: { reportPath: base.artifacts + '/report.json', reportSha256: 'e'.repeat(64) },
        }
      : {}),
  }
}
export function authored(stage = 'baseline', objective = 'epsilon', mode = 'img2img') {
  const reference = installedFixture()
  return {
    reference,
    fixture: envelope(stage, objective, mode),
    plan: literalIllustriousDynamicEmbeddingsImagePlan(stage, objective, mode),
    draft: authoring(reference, stage, objective, mode),
  }
}
export function generations(actual, plan, accepted = true) {
  return actual.rows.map((row, index) => ({
    queueItemId: row.id,
    frozen: JSON.parse(row.frozen_payload_json),
    expectedItem: plan.items[index],
    provenance: { generationConfiguration: actual.configs[index] },
    row: { status: 'completed' },
    accepted,
    dimensions: {
      pixelSha256: createHash('sha256').update(`explicit-pixel-double:${index}`).digest('hex'),
    },
  }))
}
export function retainedBaseline(actual, plan) {
  return {
    status: 'passed',
    profile: 'illustrious-dynamic-embeddings-image',
    stage: 'baseline',
    objective: plan.objective,
    literalPlan: plan,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    savedPackage: {
      acceptedLayers: 4,
      sourceLayers: 1,
      totalLayers: 5,
      reopened: true,
      lastActualSeedSnapshot: 0,
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
      const x = pixel % 256
      const alpha = plan.mode === 'img2img' ? 255 : x < 153 ? 0 : x < 168 ? 128 : 255
      rgba.set([10 + index * 40, 20 + index * 10, 30 + index * 20, alpha], pixel * 4)
    }
    return { ...generation, rgba }
  })
}
const embeddingDescription = (ref) =>
  `${ref.token} · ${ref.resource.displayName} · ${ref.resource.versionName}\nSHA-256 ${ref.resource.fileSha256}`
const loraDescription = (entry) =>
  `Enabled · ${entry.resource.displayName} · ${entry.resource.versionName}\nSHA-256 ${entry.resource.fileSha256}\nWeight ${entry.weight}`
export function comparisonInput(scope, itemIndex) {
  const { fixture, plan, reference } = scope
  const currentDraft = structuredClone(scope.draft)
  currentDraft.seed = { policy: 'fixed', value: 37 }
  currentDraft.dynamicPrompt = { maxPrompts: 3, seedBehavior: 'per-prompt' }
  currentDraft.loras[0].weight = -0.25
  currentDraft.positivePrompt = {
    text: 'a (green:1.1) glass bowl, later authoring edit',
    embeddingRefs: [],
  }
  currentDraft.negativePrompt = { text: '(grainy:0.8), later authoring edit', embeddingRefs: [] }
  const item = plan.items[itemIndex]
  const ref = scope.draft.positivePrompt.embeddingRefs[0]
  const values = {
    'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
    'sampling.sampler': [item.sampler, item.sampler],
    'sampling.scheduler': ['Normal', 'Normal'],
    'context.mode': [fixture.mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['5', '5'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': ['0', '37'],
    'seed.policy': ['fixed', 'fixed'],
    'seed.behavior': ['per-iteration', 'per-prompt'],
    'prompt.text': [item.prompts.positive, currentDraft.positivePrompt.text],
    'negativePrompt.text': [item.prompts.negative, currentDraft.negativePrompt.text],
    'prompt.embeddings': [
      item.positiveEmbedding === null ? 'None' : embeddingDescription(ref),
      'None',
    ],
    'negativePrompt.embeddings': [
      item.negativeEmbedding === null ? 'None' : embeddingDescription(ref),
      'None',
    ],
    'loras.stack': [loraDescription(scope.draft.loras[0]), loraDescription(currentDraft.loras[0])],
  }
  const rows = Object.fromEntries(
    Object.entries(values).map(([key, entries]) => [
      key,
      {
        key,
        values: entries,
        status:
          key.endsWith('embeddings') && entries[0] !== 'None'
            ? 'Removed'
            : entries[0] === entries[1]
              ? 'Same'
              : 'Changed',
      },
    ]),
  )
  const seen = []
  const dialog = {
    locator(selector) {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(rows[key], `Unknown comparison row ${selector}`)
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
    toHaveAttribute: async (name, status) => {
      assert.equal(name, 'data-status')
      assert.equal(row.status, status)
      seen.push(row.key)
    },
    toHaveText: async (text) => assert.deepEqual(row.values, text),
  })
  return {
    rows,
    seen,
    context: {
      fixture,
      plan,
      reference,
      currentDraft,
      generation: { expectedItem: item },
      dialog,
      expect,
    },
  }
}
