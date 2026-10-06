import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { inflateSync } from 'node:zlib'

import { freezeAlphaOutpaintConditioning } from './outpaint-conditioning.js'
import {
  assertOutpaintContribution,
  deriveOutpaintContributionAlphaV1,
  outpaintContributionAlphaIdentity,
} from './outpaint-contribution.js'
import { outpaintPngFromAlpha } from './test-fixtures/outpaint-contribution.js'

interface OracleCase {
  contributionAlphaZlib: string
  height: number
  name: string
  sourceAlphaZlib: string
  width: number
}

const oracle = JSON.parse(
  await readFile(
    new URL('./test-fixtures/outpaint-contribution-oracle.json', import.meta.url),
    'utf8',
  ),
) as { cases: OracleCase[] }

// Independent real pinned Invoke methods, Pillow and both IPP/scalar OpenCV generated these bytes.
// A resampling quantization, circle footprint, feather polarity/curve or distance mutation must red.
for (const sample of oracle.cases) {
  test(`Main contribution alpha matches the live upstream oracle: ${sample.name}`, () => {
    const source = inflateSync(Buffer.from(sample.sourceAlphaZlib, 'base64'))
    const expected = inflateSync(Buffer.from(sample.contributionAlphaZlib, 'base64'))
    const actual = deriveOutpaintContributionAlphaV1(source, sample.width, sample.height)
    // Node's deep Buffer diff can allocate gigabytes on a large mismatching oracle. Preserve
    // exact byte equality while keeping failure diagnostics bounded during semantic mutations.
    assert.ok(actual.equals(expected), `${sample.name}: contribution alpha bytes differ`)
  })
}

test('v1 bounded alpha refuses wrong byte count, grid, side and pixel ceiling', () => {
  for (const [width, height] of [
    [0, 8],
    [7, 8],
    [9, 8],
    [2056, 8],
    [2048, 2048],
  ]) {
    assert.throws(() => deriveOutpaintContributionAlphaV1(Buffer.alloc(8), width, height))
  }
  assert.throws(() => deriveOutpaintContributionAlphaV1(Buffer.alloc(63), 8, 8))
})

for (const name of ['vertical-64-64', 'nearopaque-64-64']) {
  test(`actual PNG contribution is source-bound and owned before asynchronous verification: ${name}`, async () => {
    const sample = oracle.cases.find((entry) => entry.name === name)!
    const source = inflateSync(Buffer.from(sample.sourceAlphaZlib, 'base64'))
    const alpha = inflateSync(Buffer.from(sample.contributionAlphaZlib, 'base64'))
    const sourcePng = await outpaintPngFromAlpha(source, sample.width, sample.height)
    const outputPng = await outpaintPngFromAlpha(alpha, sample.width, sample.height)
    const frozen = freezeAlphaOutpaintConditioning({
      bbox: { height: sample.height, width: sample.width, x: -8, y: 16 },
      sourceTargetSha256: createHash('sha256').update(sourcePng).digest('hex'),
      targetPngBytes: sourcePng,
    })
    const identity = outpaintContributionAlphaIdentity(outputPng, sample.width, sample.height)
    const verifying = assertOutpaintContribution(frozen.context, sourcePng, outputPng)
    sourcePng.fill(0)
    outputPng.fill(0)
    assert.deepEqual(await verifying, identity)
    if (name.startsWith('nearopaque')) {
      assert.equal(
        alpha.every((value) => value === 0),
        true,
      )
    }
    const restoredOutput = await outpaintPngFromAlpha(alpha, sample.width, sample.height)
    const restoredSource = await outpaintPngFromAlpha(source, sample.width, sample.height)
    const changed = Buffer.from(alpha)
    changed[changed.length / 2] ^= 1
    await assert.rejects(
      assertOutpaintContribution(
        frozen.context,
        restoredSource,
        await outpaintPngFromAlpha(changed, sample.width, sample.height),
      ),
      /output alpha/,
    )
    await assert.rejects(
      assertOutpaintContribution(
        frozen.context,
        restoredSource,
        await outpaintPngFromAlpha(alpha, sample.width, sample.height, { icc: false }),
      ),
      /ICC/,
    )
    await assert.rejects(
      assertOutpaintContribution(
        frozen.context,
        restoredSource,
        await outpaintPngFromAlpha(alpha, sample.width, sample.height, { channels: 3 }),
      ),
      /RGBA/,
    )
    assert.deepEqual(
      await assertOutpaintContribution(frozen.context, restoredSource, restoredOutput),
      identity,
    )
  })
}

test('minimal mask5 feather costs have the same uint8 outcome for scalar and IPP rounding', () => {
  const curve = (x: number) =>
    ((-1.114_203_157_815_165_7 * x + 1.329_881_624_559_73) * x + 0.803_503_679_030_122_7) * x -
    0.020_552_299_044_306_107
  const quantize = (distance: number) =>
    distance === 0
      ? 0
      : distance >= 16
        ? 255
        : Math.trunc(Math.max(0, Math.min(1, curve(Math.fround(distance / 16)))) * 255)
  let costs = 0
  // There are no obstacles: every zero is a source and its displacement determines the shortest
  // chamfer cost. Nonminimal arbitrary combinations (for example2 axial+10 diagonals=16) must not
  // be treated as reachable nearest-source distances:2 knights+8 diagonals is strictly cheaper.
  for (let x = 0; x <= 16; x++) {
    for (let y = 0; y <= 16; y++) {
      const major = Math.max(x, y)
      const minor = Math.min(x, y)
      const axial = Math.max(0, major - 2 * minor)
      const diagonal = Math.max(0, 2 * minor - major)
      const knight = Math.min(minor, major - minor)
      const ideal = axial + diagonal * 1.4 + knight * 2.1969
      const scalar = Math.fround((axial * 65_536 + diagonal * 91_750 + knight * 143_976) / 65_536)
      if (ideal > 16.01) {
        continue
      }
      const expected = quantize(scalar)
      // Pure axial steps, including fade16 and zero, are exact. For nonintegral minimal paths a
      // wider error interval covers all<=15 float additions and different nearest-cost ties.
      const tolerance = diagonal === 0 && knight === 0 ? 0 : 0.0001
      assert.equal(quantize(ideal - tolerance), expected, `lower displacement${x},${y}`)
      assert.equal(quantize(ideal + tolerance), expected, `upper displacement${x},${y}`)
      costs++
    }
  }
  assert.ok(costs > 200)
})
