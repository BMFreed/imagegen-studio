/** DPM++2M finite image profile; common import/pixel/Save hooks retain their original boundary. */
import assert from 'node:assert/strict'

import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import {
  assertAnimaDpmpp2mImageConfiguration,
  assertAnimaDpmpp2mImageFrozen,
  literalAnimaDpmpp2mImagePlan,
  normalizeAnimaDpmpp2mImageNativeInputs,
  validateAnimaDpmpp2mImageFixture,
} from './anima-dpmpp2m-image-qualification.mjs'

export const animaDpmpp2mImageProfile = Object.freeze({
  ...image,
  profile: 'anima-dpmpp2m-image',
  entrySource: 'scripts/qualify-installed-anima-dpmpp2m-image.mjs',
  adapterSource: 'scripts/anima-dpmpp2m-image-profile.mjs',
  oracleSource: 'scripts/anima-dpmpp2m-image-qualification.mjs',
  sourceDependencies: [
    'scripts/anima-heun-image-profile.mjs',
    'scripts/anima-heun-image-qualification.mjs',
    ...image.sourceDependencies,
  ],
  validateFixture: validateAnimaDpmpp2mImageFixture,
  assertFrozen: assertAnimaDpmpp2mImageFrozen,
  assertConfiguration: assertAnimaDpmpp2mImageConfiguration,
  normalizeNativeInputs: normalizeAnimaDpmpp2mImageNativeInputs,
  normalizeExecutionInputs: normalizeAnimaDpmpp2mImageNativeInputs,
  normalizeReferenceInputs: normalizeAnimaDpmpp2mImageNativeInputs,
  observedSteps: (fixture) =>
    literalAnimaDpmpp2mImagePlan(fixture.stage, fixture.mode, fixture.case).observedSteps,
  sampling: () => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'DPM++ 2M',
    code: 'dpmpp_2m',
    editedValue: 'Euler',
    editedCode: 'euler',
  }),
  assertAuthored(draft, reference, fixture, plan) {
    assert.equal(draft?.sampling?.animaMethod, 'dpmpp_2m')
    assert.deepEqual(plan, literalAnimaDpmpp2mImagePlan(fixture.stage, fixture.mode, fixture.case))
    const commonDraft = structuredClone(draft)
    commonDraft.sampling.animaMethod = 'heun'
    image.assertAuthored(commonDraft, reference, fixture, plan)
  },
  async prepareInput({
    fixture,
    plan,
    importSource,
    project,
    window,
    expect,
    tab,
    setInput,
    save,
    api,
  }) {
    const imported = await importSource(project, fixture.sourceImage)
    const before = await tab(project)
    assert.equal(before.layers.length, 1)
    assert.deepEqual(before.primaryBbox, { x: 0, y: 0, width: 256, height: 256 })
    assert.equal(before.layers[0].id, imported.layerId)
    await setInput('Denoising Strength', plan.denoisingStrength)
    if (fixture.mode === 'outpaint') {
      await window.getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
      await window.locator('.canvas-area').focus()
      for (let index = 0; index < 64; index++) await window.keyboard.down('ArrowRight')
      await window.keyboard.up('ArrowRight')
    }
    await expect.poll(async () => (await tab(project)).primaryBbox).toEqual(plan.bbox)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(plan.denoisingStrength)
    const current = await tab(project)
    assert.equal(current.layers.length, 1)
    assert.equal(current.layers[0].id, imported.layerId)
    assert.deepEqual(current.layers[0].transform, before.layers[0].transform)
    if (fixture.mode === 'outpaint')
      assert.equal((await api('getGenerationState', project.id)).animaOutpaintSupported, true)
    const saved = await save(project)
    return {
      ...imported,
      savedPackage: { path: saved.path, sha256: saved.sha256 },
      bbox: plan.bbox,
      generationDraft: structuredClone(current.generationDraft),
      sourceRect: { x: 0, y: 0, width: 256, height: 256 },
      controlled:
        'Only OS image chooser path; actual import normalization, source layer, bbox keyboard edit and Save.',
    }
  },
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const strength = String(generation.expectedItem.denoisingStrength)
    assert.equal(currentDraft.sampling.denoisingStrength, generation.expectedItem.denoisingStrength)
    const checks = {
      'sampling.animaMethod': ['DPM++ 2M', 'Euler'],
      'context.mode': [generation.expectedItem.mode, 'img2img'],
      'guidance.steps': ['4', '4'],
      'guidance.cfg': ['4', '4'],
      'denoisingStrength.value': [strength, strength],
      'seed.actual': ['0', String(currentDraft.seed.value)],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const row = dialog.locator(`[data-setting="${key}"]`)
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    assert.equal(generation.expectedItem.animaMethod, 'dpmpp_2m')
    assert.equal(currentDraft.sampling.animaMethod, 'euler')
    return evidence
  },
  summaryClaims: ({ fixture, report }) => {
    const provisional = fixture.stage === 'control'
    if (provisional) {
      assert.equal(report.generations.length, 1)
      assert.ok(report.generations.every(({ accepted }) => accepted === false))
    }
    return {
      opaqueDpmpp2mImgInferenceClaim: !provisional && fixture.mode === 'img2img',
      mixedAlphaDpmpp2mOutInferenceClaim: !provisional && fixture.mode === 'outpaint',
      neighborFirstOrderOnly: fixture.case === 'neighbor',
      historySensitivityClaim: false,
      provisionalMutationControl: provisional,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron import/Generate, installed worker0.14 DPM++2M IMG/OUT; healthy explicit Add/Save/reopen/owning comparison; controls provisional only.',
    preconditions:
      'Same pinned source/catalog/runtime/model/component/LaMa files as the image oracle. TXT-free256, authored4/CFG4/Fixed0/Myth−0.5/red1.3/blurry0.7. Neighbor opaque IMG strength.5/progress2; history IMG+OUT strength.75/progress3.',
    limits:
      'Two finite strength/case choices and one OUT geometry only; neighbor OUT excluded. History sensitivity needs paired numerical RED, unchanged alpha/visible RGB for OUT, first-order neighbor GREEN and fresh restored IMG/OUT aggregate evidence. No full solver/method parity, arbitrary seeds/strengths/formats/resolutions, quality or release/fullMVP claim.',
  },
})
