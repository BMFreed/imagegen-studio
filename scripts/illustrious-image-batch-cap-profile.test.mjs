/** Actual profile hooks with explicitly declared UI/lifecycle/pixel doubles; no native evidence. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { generationBatchCapProfile as cap } from './generation-batch-cap-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { illustriousImageBatchCapProfile as profile } from './illustrious-image-batch-cap-profile.mjs'
import { literalIllustriousImageBatchCapPlan as literal } from './illustrious-image-batch-cap-qualification.mjs'
import {
  authoring,
  envelope,
  installedFixture,
} from './illustrious-image-batch-cap-test-fixtures.mjs'

test('image-cap DI retains native/durable image hooks and real public preview/notice/refusal semantics', async () => {
  for (const key of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'extraInputFiles',
    'authorComponents',
    'afterAcceptance',
    'assertSaved',
  ])
    assert.equal(profile[key], image[key])
  for (const key of ['assertPreview', 'assertQueuedNotice', 'authorSeed'])
    assert.equal(profile[key], cap[key])
  assert.equal(profile.completionTimeoutMs(), 1_600_000)
  assert.deepEqual(profile.baselineSourceChanges(), [])
  assert.equal(await profile.afterCompletions({ fixture: envelope('prefix') }), undefined)
  const reference = installedFixture()
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['boundary', 'prefix']) {
        const fixture = envelope(stage, objective, mode)
        assert.equal(
          profile.qualificationDeadlineSeconds(fixture),
          stage === 'boundary' ? 2700 : 1800,
        )
        const plan = profile.validateFixture(fixture)
        const draft = authoring(reference, stage, objective, mode)
        profile.assertAuthored(draft, reference, fixture, plan)
        assert.equal(profile.sampling(fixture).value, objective === 'epsilon' ? 'Euler a' : 'Euler')
        assert.equal(profile.provisionalOnly(fixture), false)
        assert.deepEqual(
          profile.baselineMetadataDifferences(fixture),
          stage === 'prefix' ? ['seedBehavior'] : [],
        )
        for (const item of plan.items)
          assert.equal(profile.shouldCompareBaseline({ fixture, expectedItem: item }), true)
        for (const [label, mutate] of [
          [
            'seedsubstitution',
            (v) => {
              v.seed.value = 37
            },
          ],
          [
            'policychange',
            (v) => {
              v.seed.policy = 'random'
            },
          ],
          [
            'maxpromptssubstitution',
            (v) => {
              v.dynamicPrompt.maxPrompts = 1
            },
          ],
          [
            'behaviorchange',
            (v) => {
              v.dynamicPrompt.seedBehavior = stage === 'boundary' ? 'per-prompt' : 'per-iteration'
            },
          ],
          [
            'LoRAsignchange',
            (v) => {
              v.loras[0].weight = 0.5
            },
          ],
          [
            'VAEprecisionchange',
            (v) => {
              v.vaePrecision = 'FP16'
            },
          ],
          [
            'promptchange',
            (v) => {
              v.negativePrompt.text = 'substituted negative'
            },
          ],
        ]) {
          const wrong = structuredClone(draft)
          mutate(wrong)
          assert.notDeepEqual(wrong, draft, label + ' must change authored input')
          assert.throws(
            () => profile.assertAuthored(wrong, reference, fixture, plan),
            undefined,
            label,
          )
        }
      }
})

test('image wrapper requires one existing imported layer before it can confirm33replacement', async () => {
  const fixture = envelope('boundary')
  let generated = false
  const context = {
    fixture,
    plan: literal('boundary', 'epsilon', 'img2img'),
    project: { id: 'declared-project' },
    report: {},
    expect: {
      poll: (observe) => ({ toEqual: async (value) => assert.deepEqual(await observe(), value) }),
    },
    window: {
      getByRole: (role) => ({
        fill: async () => {
          assert.equal(role, 'textbox')
        },
        click: async () => {
          generated = true
          assert.fail('A missing source must be rejected before Generate.')
        },
      }),
    },
    tab: async () => ({
      generationDraft: { dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' } },
    }),
    setDynamic: async () => {},
    setInput: async () => {},
    save: async () => {},
    runtimeUsers: async () => [],
    checkpoint: async () => {},
    captureAdmissionEffects: async () => ({
      proof: { projectCandidateCount: 32, layerCount: 0 },
      effects: {
        tab: { layers: [], generationDraft: { seed: { policy: 'fixed', value: 0 } } },
        results: {
          candidates: Array.from({ length: 32 }, (_, i) => ({ candidateId: `candidate-${i}` })),
        },
      },
    }),
  }
  await assert.rejects(
    () => profile.afterCompletions(context),
    (error) => {
      assert.equal(error.actual, 0)
      assert.equal(error.expected, 1)
      return true
    },
  )
  assert.equal(generated, false)
  assert.equal(context.report.refusal33.unchanged, false)
})

test('summary requires152-scope shape, proper ownprefixcontrols and explicit successful32candidate preservation', () => {
  for (const stage of ['boundary', 'prefix']) {
    const fixture = envelope(stage)
    const plan = literal(stage, 'epsilon', 'img2img')
    const report = {
      generations: plan.items.map((expectedItem) => ({
        accepted: true,
        expectedItem,
        ...(stage === 'prefix'
          ? {
              baseline: {
                ...fixture.baseline,
                beforeExplicitAdd: true,
                allowedMetadataDifferences: ['seedBehavior'],
                expectedPixelSha256: 'a'.repeat(64),
                actualPixelSha256: 'a'.repeat(64),
              },
            }
          : {}),
      })),
      ...(stage === 'boundary'
        ? {
            refusal33: {
              unchanged: true,
              before: { projectCandidateCount: 32, layerCount: 1 },
              after: { projectCandidateCount: 32, layerCount: 1 },
            },
          }
        : {}),
    }
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.fullMvpClaim, false)
    assert.equal(claims.exactRawPreviewClaim, false)
    assert.equal(claims.max32InferenceClaim, stage === 'boundary')
    assert.equal(claims.preservedResultsOn33RefusalClaim, stage === 'boundary')
    assert.equal(claims.boundedTruncationClaim, stage === 'prefix')
    for (const [label, mutate] of [
      [
        'missinggeneration',
        (v) => {
          v.generations.pop()
        },
      ],
      [
        'unacceptedcandidate',
        (v) => {
          v.generations[0].accepted = false
        },
      ],
      [
        'wrongscopeproof',
        (v) => {
          if (stage === 'boundary') v.refusal33.after.projectCandidateCount = 31
          else v.generations[0].baseline.reportPath = '/declared-wrong-control.json'
        },
      ],
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.notDeepEqual(wrong, report, label + ' must change report')
      assert.throws(() => profile.summaryClaims({ fixture, plan, report: wrong }), undefined, label)
    }
  }
})
