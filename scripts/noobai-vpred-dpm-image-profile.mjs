/** Opt-in finite V image gate; installed image/acceptance boundaries remain real. */
import assert from 'node:assert/strict'

import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { validateNoobaiVpredDpmImageFixture } from './illustrious-dpm-qualification.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'

export const noobaiVpredDpmImageProfile = Object.freeze({
  ...noobaiVpredDpmProfile,
  profile: 'noobai-vpred-dpm-image',
  entrySource: 'scripts/qualify-installed-noobai-vpred-dpm-image.mjs',
  adapterSource: 'scripts/noobai-vpred-dpm-image-profile.mjs',
  sourceDependencies: [
    ...noobaiVpredDpmProfile.sourceDependencies,
    'scripts/noobai-vpred-dpm-profile.mjs',
  ],
  validateFixture: validateNoobaiVpredDpmImageFixture,
  comparisonChanged: (fixture) =>
    illustriousDpmProfile
      .comparisonChanged(fixture)
      .filter((key) => !['sampling.sampler', 'sampling.invokeScheduler'].includes(key)),
  comparisonSame: (fixture) => [
    ...illustriousDpmProfile.comparisonSame(fixture),
    'sampling.sampler',
    'sampling.invokeScheduler',
    ...(fixture.mode === 'img2img' ? ['context.mode'] : []),
  ],
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const item = generation.expectedItem
    assert.equal(item.objective, 'v_prediction')
    assert.ok(['img2img', 'outpaint'].includes(item.mode))
    assert.equal(currentDraft.sampling.sampler, 'DPM++ 2M')
    assert.equal(currentDraft.sampling.scheduler, item.schedule)
    assert.equal(currentDraft.sampling.denoisingStrength, item.denoisingStrength)
    const checks = {
      'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
      'sampling.sampler': ['DPM++ 2M', 'DPM++ 2M'],
      'sampling.scheduler': [item.schedule, item.schedule],
      // After Add, the accepted contribution fills the current Canvas target.
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': [String(item.steps), String(item.steps)],
      'guidance.cfg': ['4', '4'],
      'denoisingStrength.value': [String(item.denoisingStrength), String(item.denoisingStrength)],
      'seed.actual': ['0', String(currentDraft.seed.value)],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    return evidence
  },
  boundary: {
    actual:
      'Model Manager exact-version UI/current V policy -> new image Prepare -> installed worker0.14 DPM++2M IMG/normal alpha-OUT -> temporary candidate -> explicit Add/Save/readback/reopen/owning comparison; controls stay provisional.',
    preconditions:
      'Single existing catalog/runtime; exact Cyberfalafel V true-ZTSNR/leading, one pinned opaque256 common TXT source, Digital Art−0.5/external native VAE FP32; OUT x64 with exact LaMa/policy.',
    limits:
      'Finite Normal/Karras history and IMG-only neighboring cutoffs; no V/SDE, arbitrary grid/policy/input, exact Invoke trained-pixel parity, quality, full MVP or release claim. Numerical sensitivity requires paired observed RED/GREEN/restored evidence.',
  },
})
