/** Exact-file V/zero-SNR DPM++2M gate; installed durable runner remains real. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import {
  illustriousDpmPair,
  validateNoobaiVpredDpmFixture,
} from './illustrious-dpm-qualification.mjs'

const modelKey = (fixture) =>
  fixture.objective === 'v_prediction' ? 'illustrious' : 'illustriousEpsilon'

export const noobaiVpredDpmProfile = Object.freeze({
  ...illustriousDpmProfile,
  profile: 'noobai-vpred-dpm',
  entrySource: 'scripts/qualify-installed-noobai-vpred-dpm.mjs',
  adapterSource: 'scripts/noobai-vpred-dpm-profile.mjs',
  sourceDependencies: [
    ...illustriousDpmProfile.sourceDependencies,
    'scripts/illustrious-dpm-profile.mjs',
  ],
  validateFixture: validateNoobaiVpredDpmFixture,
  modelKey,
  originalSourceKeys: (fixture) => [modelKey(fixture), 'illustriousLora', 'externalVaeNative'],
  sampling(fixture) {
    const pair = illustriousDpmPair('dpmpp_2m', fixture.schedule)
    // SDE+ZTSNR and Euler/Karras are refused. Later edits use the same valid pair;
    // seed/prompts/LoRA/context still distinguish current state from the accepted result.
    return {
      label: 'Sampler',
      draftKey: 'sampler',
      value: pair.sampler,
      code: pair.sampler,
      editedValue: pair.sampler,
      editedCode: pair.sampler,
      scheduler: fixture.schedule,
    }
  },
  async authorComponents(ctx) {
    await illustriousDpmProfile.authorComponents(ctx)
    const { window, expect, project, reference, fixture, tab } = ctx
    const source = reference[modelKey(fixture)]
    const before = await tab(project)
    assert.equal(before.generationDraft.model.localVersionId, source.installed.versionId)
    await window.getByRole('button', { name: 'Manage Models', exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
    const row = manager.locator('.version-row--project')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(source.versionName)
    const prediction = row.locator(`[aria-label="Prediction type for ${source.versionName}"]`)
    await expect(prediction).toContainText(
      fixture.objective === 'v_prediction' ? 'V-prediction' : 'Epsilon',
    )
    const ztsnr = row.getByRole('switch', { name: `ZTSNR for ${source.versionName}`, exact: true })
    await expect(ztsnr).toHaveAttribute(
      'aria-checked',
      String(fixture.objective === 'v_prediction'),
    )
    const spacing = row.locator(`[aria-label="Timestep spacing for ${source.versionName}"]`)
    await expect(spacing).toContainText('Leading')
    const catalog = await window.evaluate(() => window.api.models.getCatalog())
    assert.equal(catalog.ok, true)
    const resource = catalog.value.find((value) => value.id === source.installed.resourceId)
    const version = resource.versions.find((value) => value.id === source.installed.versionId)
    assert.equal(version.sha256, source.sha256)
    assert.equal(version.fileSizeBytes, source.byteSize)
    assert.equal(version.predictionType, fixture.objective)
    assert.deepEqual(version.noiseProfile, {
      effective: {
        schemaVersion: 1,
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: fixture.objective === 'v_prediction',
        timestepSpacing: 'leading',
      },
      rescaleBetasZeroSnrSource: 'override',
      timestepSpacingSource: 'override',
    })
    await window.screenshot({
      path: path.join(fixture.artifacts, 'model-manager-profile.png'),
      animations: 'disabled',
    })
    await writeFile(
      path.join(fixture.artifacts, 'model-manager-profile.json'),
      JSON.stringify(
        {
          resourceId: resource.id,
          versionId: version.id,
          sha256: version.sha256,
          byteSize: version.fileSizeBytes,
          predictionType: version.predictionType,
          noiseProfile: version.noiseProfile,
          ui: {
            prediction: await prediction.innerText(),
            ztsnr: await ztsnr.getAttribute('aria-checked'),
            spacing: await spacing.innerText(),
          },
          boundary:
            'Actual Model Manager confirms existing exact-file policy; no library edit or installation.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    )
    await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
    await expect(manager).not.toBeVisible()
    assert.deepEqual((await tab(project)).generationDraft, before.generationDraft)
  },
  comparisonChanged: (fixture) =>
    illustriousDpmProfile
      .comparisonChanged(fixture)
      .filter((key) => !['sampling.sampler', 'sampling.invokeScheduler'].includes(key)),
  comparisonSame: (fixture) => [
    ...illustriousDpmProfile.comparisonSame(fixture),
    'sampling.sampler',
    'sampling.invokeScheduler',
  ],
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const item = generation.expectedItem
    assert.equal(currentDraft.sampling.sampler, 'DPM++ 2M')
    assert.equal(currentDraft.sampling.scheduler, item.schedule)
    const checks = {
      'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
      'sampling.sampler': ['DPM++ 2M', 'DPM++ 2M'],
      'sampling.scheduler': [item.schedule, item.schedule],
      'context.mode': ['txt2img', 'img2img'],
      'guidance.steps': ['4', '4'],
      'guidance.cfg': ['4', '4'],
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
      'Model Manager exact-version UI/current policy -> new Prepare -> installed worker0.14 DPM++2M TXT -> temporary candidate -> explicit Add/Save/readback/reopen/owning comparison; controls stay provisional.',
    preconditions:
      'Single existing catalog/runtime; exact Cyberfalafel V true-ZTSNR/leading and official EPS false-ZTSNR/leading neighbor; weighted raw prompts, signed Digital Art−0.5/external native VAE FP32.',
    limits:
      '256x256/N4/CFG4/Fixed0, V Normal/Karras plus EPS Normal neighbor only. Leading remains an export assumption; no V IMG/OUT, quality, arbitrary model/grid/policy, exact Invoke trained-pixel parity, full MVP or release claim.',
  },
})
