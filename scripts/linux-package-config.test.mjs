import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const config = require('../electron-builder.config.cjs')

// These are source-level release guards. Actual builder collection, the native
// SQLite ABI and startup outside the checkout need packaged-artifact checks.
test('Linux package admits built app consumers, not checkout, runtime or model payloads', () => {
  assert.deepEqual(config.files, [
    'package.json',
    'dist/main/**/*',
    'dist/preload/**/*',
    'dist/renderer/**/*',
    '!dist/**/*.map',
  ])
  assert.equal(config.asar, true)
  assert.equal(config.npmRebuild, true)
  assert.ok(config.asarUnpack.includes('**/*.node'))
  assert.equal(config.extraFiles, undefined)
  assert.equal(config.extraResources, undefined)
  assert.equal(config.linux.extraFiles, undefined)
  assert.deepEqual(config.linux.extraResources, [
    { from: 'dist/native/igs-wallet-bootstrap', to: 'igs-wallet-bootstrap' },
  ])
  assert.equal(config.directories.app, undefined)
  assert.equal(config.electronDist, undefined)
})

test('local Linux package cannot implicitly select a publisher or another platform', () => {
  assert.equal(config.publish, null)
  assert.deepEqual(config.linux.target, [{ target: 'AppImage', arch: ['x64'] }])
  for (const unsupported of ['win', 'mac', 'nsis', 'dmg']) {
    assert.equal(config[unsupported], undefined)
  }
  for (const hook of [
    'beforeBuild',
    'beforePack',
    'afterPack',
    'afterSign',
    'afterAllArtifactBuild',
    'artifactBuildStarted',
    'artifactBuildCompleted',
  ]) {
    assert.equal(config[hook], undefined)
  }
})

test('packaged Electron retains the Invoke launcher execution and ASAR boundaries', () => {
  assert.equal(config.electronFuses.runAsNode, false)
  assert.equal(config.electronFuses.enableNodeOptionsEnvironmentVariable, false)
  assert.equal(config.electronFuses.enableNodeCliInspectArguments, false)
  assert.equal(config.electronFuses.onlyLoadAppFromAsar, true)
  assert.equal(config.electronFuses.enableEmbeddedAsarIntegrityValidation, true)
  assert.equal(config.electronFuses.enableCookieEncryption, true)
})
