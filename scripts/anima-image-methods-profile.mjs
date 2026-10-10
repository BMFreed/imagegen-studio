/** Three finite native image methods share actual import, pixel, Add/Save/reopen boundaries. */
import assert from 'node:assert/strict'

import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import {
  animaImageMethodDefinition,
  assertAnimaImageMethodsConfiguration,
  assertAnimaImageMethodsFrozen,
  literalAnimaImageMethodsPlan,
  normalizeAnimaImageMethodsNativeInputs,
  validateAnimaImageMethodsFixture,
} from './anima-image-methods-qualification.mjs'

export const animaImageMethodsProfile = Object.freeze({
  ...image,
  profile: 'anima-image-methods',
  entrySource: 'scripts/qualify-installed-anima-image-methods.mjs',
  adapterSource: 'scripts/anima-image-methods-profile.mjs',
  oracleSource: 'scripts/anima-image-methods-qualification.mjs',
  sourceDependencies: [
    'scripts/anima-heun-image-profile.mjs',
    'scripts/anima-heun-image-qualification.mjs',
    ...image.sourceDependencies,
  ],
  validateFixture: validateAnimaImageMethodsFixture,
  assertFrozen: assertAnimaImageMethodsFrozen,
  assertConfiguration: assertAnimaImageMethodsConfiguration,
  normalizeNativeInputs: normalizeAnimaImageMethodsNativeInputs,
  normalizeExecutionInputs: normalizeAnimaImageMethodsNativeInputs,
  normalizeReferenceInputs: normalizeAnimaImageMethodsNativeInputs,
  inferenceSteps: (fixture) =>
    animaImageMethodDefinition(fixture.method).native[fixture.case].steps,
  observedSteps: (fixture) =>
    literalAnimaImageMethodsPlan(fixture.stage, fixture.method, fixture.mode, fixture.case)
      .observedSteps,
  sampling: (fixture) => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: animaImageMethodDefinition(fixture.method).label,
    code: fixture.method,
    editedValue: 'Euler',
    editedCode: 'euler',
  }),
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(
      plan,
      literalAnimaImageMethodsPlan(fixture.stage, fixture.method, fixture.mode, fixture.case),
    )
    assert.equal(draft?.sampling?.animaMethod, fixture.method)
    assert.equal(draft?.sampling?.steps, plan.steps)
    const commonDraft = structuredClone(draft)
    commonDraft.sampling.animaMethod = 'heun'
    commonDraft.sampling.steps = 4
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
    const item = generation.expectedItem
    const definition = animaImageMethodDefinition(item.animaMethod)
    assert.equal(currentDraft.sampling.denoisingStrength, item.denoisingStrength)
    const checks = {
      'sampling.animaMethod': [definition.label, 'Euler'],
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': [String(item.steps), String(item.steps)],
      'guidance.cfg': ['4', '4'],
      'denoisingStrength.value': [String(item.denoisingStrength), String(item.denoisingStrength)],
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
      method: fixture.method,
      opaqueImgInferenceClaim: !provisional && fixture.mode === 'img2img',
      mixedAlphaOutInferenceClaim: !provisional && fixture.mode === 'outpaint',
      neighborOnly: fixture.case === 'neighbor',
      methodMutationSensitivityClaim: false,
      provisionalMutationControl: provisional,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron import/Generate, installed worker0.14 DPM++2M SDE/ER-SDE/LCM IMG/OUT; healthy explicit Add/Save/reopen/owning comparison; controls provisional only.',
    preconditions:
      'Same pinned image/catalog/runtime/model/component/LaMa sources. TXT-free256/CFG4/Fixed0/Myth−0.5/red1.3/blurry0.7. SDE/LCM authored4, ER authored5; neighbor IMG strength.5, history IMG/OUT strength.75.',
    limits:
      'Eight finite cases per method, one OUT geometry and two strengths only. Method mutation sensitivity needs paired numerical REDs, unchanged OUT alpha/visible RGB RED, same-full-grid neighbor GREEN and fresh restored IMG/OUT evidence. LCM uses once-shifted clipped flow grid; no distilled quality/Turbo, arbitrary seeds/formats/resolutions, full solver parity, release or fullMVP claim.',
  },
})
