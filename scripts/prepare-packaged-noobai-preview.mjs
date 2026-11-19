/**
 * Build the stock app and the standalone controlled Preview qualifier from identical desktop
 * assets.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { build as bundle } from 'esbuild'

const [run, mode, ...extra] = process.argv.slice(2)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const repo = path.dirname(import.meta.dirname)
assert.ok(extra.length === 0 && ['live', 'controlled'].includes(mode))
assert.equal(path.dirname(run), path.join(artifactRoot, 'runs/packaged-noobai-preview'))
assert.match(path.basename(run), /^\d{8}(?:-r\d+)?$/)
assert.equal(await realpath(run), run)
assert.equal((await lstat(run)).uid, process.getuid())
const work = path.join(run, 'package-work', mode)
await mkdir(work, { recursive: true, mode: 0o700 })

const require = createRequire(import.meta.url)
const config = require('../electron-builder.config.cjs')
const { build, createTargets, Platform } = require('electron-builder')
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asarRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const { extractFile } = asarRequire('@electron/asar')
const electronDist = await realpath(
  path.join(path.dirname(require.resolve('electron/package.json')), 'dist'),
)
const sqlite = await realpath(
  path.join(
    path.dirname(require.resolve('better-sqlite3/package.json')),
    'prebuilds/linux-x64.node',
  ),
)

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function pin(filename) {
  assert.equal(await realpath(filename), filename)
  assert.ok((await lstat(filename)).isFile())
  const hash = createHash('sha256')
  for await (const part of createReadStream(filename)) hash.update(part)
  return { sha256: hash.digest('hex'), sizeBytes: (await lstat(filename)).size }
}

const dist = {}
async function recordDist(directory) {
  for (const item of await readdir(path.join(repo, directory), { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) await recordDist(file)
    else if (!file.endsWith('.map')) dist[file] = (await pin(path.join(repo, file))).sha256
  }
}
await recordDist('dist')
const main = path.join(repo, 'src/main/index.ts')
const collaborator = path.join(repo, 'scripts/fixtures/packaged-noobai-preview-transport.ts')
const variantName = 'noobai-preview-qualification.cjs'
const entrypoint = mode === 'controlled' ? `dist/main/${variantName}` : 'dist/main/main.cjs'
const sqlitePin = await pin(sqlite)
let variant = null
if (mode === 'controlled') {
  const outfile = path.join(work, variantName)
  await bundle({
    absWorkingDir: repo,
    entryPoints: [main],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile,
    external: ['electron', 'better-sqlite3', 'electron-updater'],
    plugins: [
      {
        name: 'noobai-preview-qualification',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]src[/\\]main[/\\]index\.ts$/ }, async ({ path: file }) => {
            if (file !== main) return undefined
            let contents = await readFile(file, 'utf8')
            for (const [before, after] of [
              [
                'const civitaiClient = new CivitaiClient()',
                'const noobaiPorts = createNoobaiPreviewTransport(paths.dataRoot)\n      const civitaiClient = new CivitaiClient(noobaiPorts.metadata)',
              ],
              [
                'new ModelDownloader(),',
                "new ModelDownloader({ transport: noobaiPorts.body, resolveAddresses: async () => ['1.1.1.1'] }),",
              ],
            ]) {
              assert.equal(contents.split(before).length, 2, 'Expected one Main construction seam.')
              contents = contents.replace(before, after)
            }
            return {
              contents:
                `import { createNoobaiPreviewTransport } from ${JSON.stringify(collaborator)}\n` +
                contents,
              loader: 'ts',
              resolveDir: path.dirname(main),
            }
          })
        },
      },
    ],
  })
  variant = await pin(outfile)
}
let asar
const packages = await build({
  projectDir: repo,
  targets: createTargets([Platform.LINUX], 'AppImage', 'x64'),
  publish: 'never',
  config: {
    ...config,
    electronVersion: require('electron/package.json').version,
    electronDist,
    npmRebuild: false,
    directories: { output: path.join(work, 'output') },
    ...(variant
      ? {
          files: [...config.files, { from: work, to: 'dist/main', filter: [variantName] }],
          extraMetadata: { main: entrypoint },
        }
      : {}),
    afterPack: async ({ appOutDir }) => {
      const resources = path.join(appOutDir, 'resources')
      const archive = path.join(resources, 'app.asar')
      const packagedMetadata = JSON.parse(extractFile(archive, 'package.json').toString('utf8'))
      assert.equal(packagedMetadata.main, entrypoint)
      for (const [file, expected] of Object.entries(dist))
        assert.equal(digest(extractFile(archive, file)), expected, file)
      if (variant) assert.equal(digest(extractFile(archive, entrypoint)), variant.sha256)
      assert.deepEqual(
        await pin(
          path.join(
            resources,
            'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/linux-x64.node',
          ),
        ),
        sqlitePin,
      )
      asar = await pin(archive)
    },
  },
})
const images = packages.filter((file) => file.endsWith('.AppImage'))
assert.equal(images.length, 1)
assert.ok(asar)
assert.doesNotMatch(
  await readFile(path.join(repo, 'dist/main/main.cjs'), 'utf8'),
  /owned-noobai-preview-qualification-only/,
)
const report = {
  mode,
  modeBoundary: variant
    ? 'Controlled metadata and refused body transport'
    : 'Unmodified app payload',
  package: { path: images[0], ...(await pin(images[0])) },
  asar,
  dist,
  entrypoint,
  fuses: config.electronFuses,
  source: {
    packager: await pin(import.meta.filename),
    main: await pin(main),
    transport: variant ? await pin(collaborator) : null,
  },
  sqlite: sqlitePin,
  variant,
}
await writeFile(path.join(run, `package-${mode}.json`), JSON.stringify(report, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
})
console.log(JSON.stringify(report.package))
