/** Packages exact on-disk desktop assets with one qualification-only Main collaborator. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { build as bundle } from 'esbuild'

const require = createRequire(import.meta.url)
const repo = path.dirname(import.meta.dirname)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const [run, ...rest] = process.argv.slice(2)
assert.ok(run && rest.length === 0)
assert.equal(await realpath(run), run)
assert.equal(path.dirname(run), path.join(artifactRoot, 'runs/packaged-runtime-setup'))
assert.equal((await lstat(run)).uid, process.getuid())

const payloads = path.join(run, 'package-work')
await mkdir(payloads, { mode: 0o700 })
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function pin(file, expected) {
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink())
  assert.equal(await realpath(file), file)
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  const observed = hash.digest('hex')
  if (expected !== undefined) assert.equal(observed, expected, file)
  return { path: file, sha256: observed, sizeBytes: stat.size }
}

const shared = path.join(artifactRoot, 'shared')
const transport = path.join(shared, 'runtime-transport-fa8b9272-r1')
const sources = {
  runtimeEnvelope: [
    path.join(transport, 'artifact-final/runtime-release.json'),
    '9840921d3aebb6915b33c778335cb072e1a2a02f20f1eb0f9d2998bc668e6157',
  ],
  transportEnvelope: [
    path.join(transport, 'artifact-final/runtime-transport.json'),
    '5f15c2dd5250e8331193d66d4d12a2a3a39a497545e2be4328304149220d320e',
  ],
  trustedKeys: [
    path.join(transport, 'evidence/trusted-keys.json'),
    'c56b377037ccd0b90c51e338023de62b9777a87282b429cbbd9f5b26488f5146',
  ],
  archive: [
    path.join(transport, 'artifact-final/runtime-payload.zip'),
    '9b4e22af0605b13ce3a6e2a854509dcf051d2d1556a55fae88e28c7ae1c360cd',
  ],
  lama: [
    path.join(
      shared,
      'regional-public-worker-014-20261103/data/imagegen-studio/inference-resources/big-lama.pt',
    ),
    '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
  ],
}
const inputs = Object.fromEntries(
  await Promise.all(
    Object.entries(sources).map(async ([name, args]) => [name, await pin(...args)]),
  ),
)
const writeJson = (name, value) =>
  writeFile(path.join(run, name), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
await writeJson('setup-inputs.json', inputs)
const main = path.join(repo, 'src/main/index.ts')
const backend = path.join(repo, 'scripts/fixtures/packaged-runtime-setup-backend.ts')
const needle = 'new RuntimeManager(runtimeRoots, undefined, undefined, undefined, {'
const standardMain = path.join(repo, 'dist/main/main.cjs')
assert.doesNotMatch(
  await readFile(standardMain, 'utf8'),
  /IMAGEGEN_PACKAGED_RUNTIME_SETUP_CONFIG|IGS_SETUP_QUALIFICATION_REPAIR_FAULT/,
)
const name = 'setup-qualification.cjs'
const variant = path.join(payloads, name)
await bundle({
  absWorkingDir: repo,
  entryPoints: [main],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: variant,
  external: ['electron', 'better-sqlite3', 'electron-updater'],
  plugins: [
    {
      name: 'setup-qualification-collaborator',
      setup(builder) {
        builder.onLoad({ filter: /[\\/]src[\\/]main[\\/]index\.ts$/ }, async ({ path: file }) => {
          if (file !== main) return undefined
          const contents = await readFile(file, 'utf8')
          assert.equal(contents.split(needle).length, 2, 'One exact Main construction seam.')
          return {
            loader: 'ts',
            resolveDir: path.dirname(file),
            contents:
              `import { createPackagedRuntimeSetupManager } from ${JSON.stringify(backend)}\n` +
              contents.replace(
                needle,
                'await createPackagedRuntimeSetupManager(runtimeRoots, paths.dataRoot, {',
              ),
          }
        })
      },
    },
  ],
})
const outputPin = await pin(variant)
const qualifier = await readFile(variant, 'utf8')
assert.match(qualifier, /IMAGEGEN_PACKAGED_RUNTIME_SETUP_CONFIG/)
assert.match(qualifier, /IGS_SETUP_QUALIFICATION_REPAIR_FAULT/)

const dist = {}
async function readDist(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) await readDist(file)
    else if (!item.name.endsWith('.map')) dist[path.relative(repo, file)] = (await pin(file)).sha256
  }
}
await readDist(path.join(repo, 'dist/main'))
await readDist(path.join(repo, 'dist/preload'))
await readDist(path.join(repo, 'dist/renderer'))
const { build, createTargets, Platform } = require('electron-builder')
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asarRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const { extractFile } = asarRequire('@electron/asar')
const config = require('../electron-builder.config.cjs')
const electronDirectory = await realpath(
  path.join(path.dirname(require.resolve('electron/package.json')), 'dist'),
)
let asarPin
const images = await build({
  projectDir: repo,
  targets: createTargets([Platform.LINUX], 'AppImage', 'x64'),
  publish: 'never',
  config: {
    ...config,
    electronVersion: require('electron/package.json').version,
    electronDist: electronDirectory,
    directories: { output: path.join(payloads, 'output') },
    files: [...config.files, { from: payloads, to: 'dist/main', filter: [name] }],
    extraMetadata: { main: `dist/main/${name}` },
    npmRebuild: false,
    linux: { ...config.linux, artifactName: 'setup-qualification-${version}-${arch}.${ext}' },
    afterPack: async ({ appOutDir }) => {
      const archive = path.join(appOutDir, 'resources/app.asar')
      const check = (file, expected) =>
        assert.equal(sha256(extractFile(archive, file)), expected, file)
      const metadata = JSON.parse(extractFile(archive, 'package.json').toString())
      assert.equal(metadata.main, `dist/main/${name}`)
      assert.equal(metadata.version, require('../package.json').version)
      check(metadata.main, outputPin.sha256)
      for (const [file, expected] of Object.entries(dist)) check(file, expected)
      asarPin = await pin(archive)
    },
  },
})
const packages = images.filter((file) => file.endsWith('.AppImage'))
assert.equal(packages.length, 1)
assert.ok(asarPin)
assert.deepEqual(await pin(asarPin.path), asarPin)
const report = {
  scope: 'Qualification-only AppImage; unmodified ordinary production build is separate.',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  source: await Promise.all([main, backend, import.meta.filename].map((file) => pin(file))),
  productionDist: dist,
  qualifier: outputPin,
  asar: asarPin,
  package: await pin(packages[0]),
  fuses: config.electronFuses,
  inputs,
}
await writeJson('package.json', report)
console.log(JSON.stringify(report.package))
