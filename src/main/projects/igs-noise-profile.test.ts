import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import { acceptedOutpaintProvenanceFixture } from './test-fixtures/outpaint-provenance.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`exact accepted ${mode} noise profile survives real Save, reopen and portable copy without model files`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-noise-profile-portable-'))
    try {
      const project = createEmptyProjectDocumentV1({
        primaryBbox: { height: 64, width: 64, x: -7, y: 12 },
        title: `Accepted ${mode} noise profile`,
      })
      const image = await acceptedOutputPngFixture(64, 64)
      const provenance =
        mode === 'outpaint'
          ? acceptedOutpaintProvenanceFixture(
              'illustrious',
              project,
              await animaFixturePng(128),
              image,
              project.primaryBbox,
            )
          : acceptedRasterProvenanceFixture(project, image, project.primaryBbox)
      assert.ok(provenance.kind !== 'anima-outpaint')
      if (mode === 'img2img') {
        Object.assign(provenance, { kind: 'illustrious-img2img' })
        Object.assign(provenance.generationConfiguration, { mode: 'img2img' })
        Object.assign(provenance.generationConfiguration.sampling, { denoisingStrength: 0.5 })
      }
      const profile = {
        ...defaultIllustriousNoiseProfile(),
        rescaleBetasZeroSnr: true,
        timestepSpacing: 'trailing' as const,
      }
      provenance.generationConfiguration.sampling.noiseProfile = structuredClone(profile)
      const id = randomUUID()
      const assetPath = `assets/layers/${id}.png`
      project.layers = [
        {
          asset: {
            bytes: image.length,
            height: 64,
            path: assetPath,
            sha256: createHash('sha256').update(image).digest('hex'),
            width: 64,
          },
          blendMode: 'normal',
          generationProvenance: provenance,
          id,
          kind: 'raster',
          locked: false,
          name: 'Accepted result',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 12 },
          visible: true,
        },
      ]
      const filePath = path.join(root, 'original.igs')
      await saveIgsPackage(filePath, {
        assets: { [assetPath]: { bytes: image } },
        preview: {
          merged: image,
          rect: project.primaryBbox,
          status: 'rendered',
          thumbnail: await readFile(path.resolve('src/main/projects/placeholders/empty.webp')),
        },
        project,
      })
      assert.deepEqual(
        requireRasterLayer((await readIgsPackage(filePath)).project.layers[0]).generationProvenance,
        provenance,
      )
      const copied = path.join(root, 'portable.igs')
      await copyFile(filePath, copied)
      const portable = await readIgsPackage(copied)
      assert.deepEqual(
        requireRasterLayer(portable.project.layers[0]).generationProvenance,
        provenance,
      )
      assert.deepEqual(await portable.readMember(assetPath), image)
      assert.equal(Object.hasOwn(portable.project.generationDraft.sampling, 'noiseProfile'), false)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}
