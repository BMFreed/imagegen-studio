/** Opt-in finite image dynamic batch; lexical refusal precedes fixture/native reads. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { illustriousDynamicImageProfile } from './illustrious-dynamic-image-profile.mjs'
import { runInstalledDynamicBatchQualification } from './installed-dynamic-batch-driver.mjs'
assert.deepEqual(process.argv.slice(2, 3), ['--fixture'], 'Expected exactly --fixture ABS.')
assert.equal(process.argv.length, 4, 'Expected exactly --fixture ABS.')
assert.ok(path.isAbsolute(process.argv[3]), 'Fixture must be an absolute path.')
assert.equal(path.resolve(process.argv[3]), process.argv[3], 'Fixture path must be normalized.')
await runInstalledDynamicBatchQualification(illustriousDynamicImageProfile, process.argv[3])
