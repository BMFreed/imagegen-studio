/** Controlled Electron port only; no helper, process, binary or application is launched. */
import type { App } from 'electron'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElectronApplicationRelauncher } from './electron-application-relaunch.js'

const supportedPlatform = process.platform === 'linux' && process.arch === 'x64'
const target = '/owned/Applications/Studio.AppImage'

test(
  'pinned relaunch preserves its exact Main-owned path, fixed runtime argument and Electron receiver',
  { skip: !supportedPlatform },
  () => {
    const calls: { options: unknown; receiver: unknown }[] = []
    const appPort: Pick<App, 'relaunch'> = {
      relaunch(this: unknown, options) {
        calls.push({ options, receiver: this })
        return true
      },
    }
    const relaunch = createElectronApplicationRelauncher(appPort, '44.4.5')
    assert.ok(relaunch)
    assert.equal(calls.length, 0, 'Creating the adapter does not arm a relaunch.')
    assert.equal(relaunch(target), true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].receiver, appPort)
    assert.deepEqual(calls[0].options, { args: ['--appimage-extract-and-run'], execPath: target })
  },
)

test(
  'raw native false and unknown values remain observable instead of becoming success',
  { skip: !supportedPlatform },
  () => {
    const pending = Promise.resolve(true)
    const thenable = { then: () => undefined }
    for (const result of [false, undefined, null, 0, 1, 'true', pending, thenable]) {
      const appPort: Pick<App, 'relaunch'> = { relaunch: () => result }
      const relaunch = createElectronApplicationRelauncher(appPort, '44.4.5')
      assert.ok(relaunch)
      assert.equal(relaunch(target), result)
    }
  },
)

test(
  'the Electron port exception is preserved without fallback or a second attempt',
  { skip: !supportedPlatform },
  () => {
    const failure = new Error('Owned native handoff failure.')
    let calls = 0
    const relaunch = createElectronApplicationRelauncher(
      {
        relaunch: () => {
          calls++
          throw failure
        },
      },
      '44.4.5',
    )
    assert.ok(relaunch)
    assert.throws(
      () => relaunch(target),
      (error: unknown) => error === failure,
    )
    assert.equal(calls, 1)
  },
)

test(
  'invalid paths refuse before the Electron port and never fall back to the running executable',
  { skip: !supportedPlatform },
  () => {
    let calls = 0
    const relaunch = createElectronApplicationRelauncher(
      {
        relaunch: () => {
          calls++
        },
      },
      '44.4.5',
    )
    assert.ok(relaunch)
    for (const value of [
      '',
      '.',
      'Studio.AppImage',
      '/',
      '/owned/../Studio.AppImage',
      '/owned//Studio.AppImage',
      '/owned/Studio.AppImage/',
      '/owned/Studio\0.AppImage',
    ]) {
      assert.throws(() => relaunch(value), /verified canonical AppImage path/)
    }
    assert.equal(calls, 0)
  },
)

test('an unsupported Electron build refuses without calling its port', () => {
  let calls = 0
  const appPort = {
    relaunch: () => {
      calls++
    },
  }
  for (const version of ['', '44.4.4', '44.4.6', '45.0.0', '44.4.5+other']) {
    assert.equal(createElectronApplicationRelauncher(appPort, version), null)
  }
  assert.equal(calls, 0)
})

test(
  'unsupported host platforms do not obtain a relaunch capability',
  { skip: supportedPlatform },
  () => {
    let calls = 0
    assert.equal(
      createElectronApplicationRelauncher(
        {
          relaunch: () => {
            calls++
          },
        },
        '44.4.5',
      ),
      null,
    )
    assert.equal(calls, 0)
  },
)
