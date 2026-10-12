/** Genuine Main rows/configs; retained reports, DOM peers and pixels below are declared doubles. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  authoring,
  installedFixture,
  produced,
  resource,
} from './anima-dynamic-image-per-prompt-main-fixtures.mjs'
import { literalAnimaDynamicImagePerPromptPlan } from './anima-dynamic-image-per-prompt-qualification.mjs'
export { installedFixture, produced, resource }
const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/anima-per-prompt-image-unit',
)
export function envelope(stage = 'numeric-control', mode = 'img2img') {
  return {
    schemaVersion: 1,
    profile: 'anima-dynamic-image-per-prompt',
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
    ...(stage === 'per-prompt'
      ? {
          baseline: {
            reportPath: path.join(root, `numeric-control-${mode}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
    artifacts: path.join(root, `${stage}-${mode}`),
  }
}
export function authored(stage = 'numeric-control', mode = 'img2img') {
  const reference = installedFixture()
  return {
    reference,
    fixture: envelope(stage, mode),
    plan: literalAnimaDynamicImagePerPromptPlan(stage, mode),
    draft: authoring(reference, stage, mode),
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
      pixelSha256: createHash('sha256').update(`explicit-not-native-pixels:${index}`).digest('hex'),
    },
  }))
}
export function retainedBaseline(actual, plan) {
  return {
    status: 'passed',
    profile: 'anima-dynamic-image-per-prompt',
    stage: 'numeric-control',
    literalPlan: plan,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    savedPackage: {
      acceptedLayers: 32,
      sourceLayers: 1,
      totalLayers: 33,
      reopened: true,
      lastActualSeedSnapshot: 7,
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
      rgba.set([10 + index * 3, 20 + index * 5, 30 + index * 7, alpha], pixel * 4)
    }
    return { ...generation, rgba }
  })
}
const description = (entry) =>
  `Enabled · ${entry.resource.displayName} · ${entry.resource.versionName}\nSHA-256 ${entry.resource.fileSha256}\nWeight ${entry.weight}`
export function comparisonInput(scope, index) {
  const { fixture, plan, reference } = scope,
    item = plan.items[index]
  const currentDraft = structuredClone(scope.draft)
  currentDraft.seed = { policy: 'fixed', value: 37 }
  currentDraft.dynamicPrompt = {
    maxPrompts: 3,
    seedBehavior: plan.seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration',
  }
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
    'context.mode': [fixture.mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['4', '4'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': [String(item.seed), '37'],
    'seed.policy': ['fixed', 'fixed'],
    'seed.behavior': [item.seedBehavior, currentDraft.dynamicPrompt.seedBehavior],
    'prompt.text': [item.prompts.positive, currentDraft.positivePrompt.text],
    'negativePrompt.text': [item.prompts.negative, currentDraft.negativePrompt.text],
    'prompt.embeddings': ['None', 'None'],
    'negativePrompt.embeddings': ['None', 'None'],
    'loras.stack': [description(scope.draft.loras[0]), description(currentDraft.loras[0])],
  }
  const rows = Object.fromEntries(
    Object.entries(values).map(([key, entries]) => [
      key,
      {
        key,
        values: entries,
        status: entries[0] === entries[1] ? 'Same' : 'Changed',
      },
    ]),
  )
  const seen = []
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
