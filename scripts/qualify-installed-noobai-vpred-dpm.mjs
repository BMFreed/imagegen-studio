/** Opt-in bounded V-profile gate; malformed CLI arguments refuse before reads. */
import assert from 'node:assert/strict'
import path from 'node:path'

import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { runInstalledDynamicBatchQualification } from './installed-dynamic-batch-driver.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'], 'Expected exactly --fixture ABS.')
assert.equal(process.argv.length, 4, 'Expected exactly --fixture ABS.')
assert.ok(path.isAbsolute(process.argv[3]), 'Fixture must be an absolute path.')
assert.equal(path.resolve(process.argv[3]), process.argv[3], 'Fixture path must be normalized.')

await runInstalledDynamicBatchQualification(noobaiVpredDpmProfile, process.argv[3])
