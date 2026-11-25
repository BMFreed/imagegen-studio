/** Measure Home with owned synthetic Projects in the actual packaged renderer. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { saveIgsPackage } from '../../src/main/projects/igs-package.ts'
import { ProjectIndexRepository } from '../../src/main/projects/project-index.ts'
import {
  createEmptyProjectDocumentV1,
  parseProjectDocumentV1,
} from '../../src/shared/projects/project-schema.ts'
import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'
import { sessionMethod } from './packaged-kde-chooser.mjs'
import {
  assertOfflineProjectDesktop,
  indexSnapshot,
  regularFile,
} from './packaged-noobai-import-chooser.mjs'

const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
// Keep the real 2×2 encodings from igs-package.test.ts for the control workload.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const thumbnail = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)
const thumbnailSha256 = createHash('sha256').update(thumbnail).digest('hex')

function rasterFixture(size, bytes) {
  return {
    canvas: { height: size, width: size, x: 0, y: 0 },
    png: bytes,
    pngSha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

const tinyRaster = rasterFixture(2, png)

function pngChunk(name, data) {
  const type = Buffer.from(name, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length)
  type.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), 8 + data.length)
  return chunk
}

export function largeRasterFixture(seed = 'ImageGen Studio Home scale fixture v1') {
  const size = 1024
  const rowBytes = size * 3
  const texturedRows = size / 4
  const texture = createHash('shake256', { outputLength: rowBytes * texturedRows })
    .update(seed)
    .digest()
  const rows = Buffer.alloc((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    const offset = y * (rowBytes + 1) + 1
    if (y < texturedRows) {
      texture.copy(rows, offset, y * rowBytes, (y + 1) * rowBytes)
    } else {
      rows.fill(y >>> 2, offset, offset + rowBytes)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // Bits per channel.
  header[9] = 2 // RGB.
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  assert.ok(bytes.length >= 768 * 1024 && bytes.length < 1024 * 1024)
  return rasterFixture(size, bytes)
}

export function layeredRasterFixture() {
  return {
    ...largeRasterFixture(),
    additionalRasters: [2, 3, 4].map((index) => largeRasterFixture(`Home scale layer ${index}`)),
  }
}

const writeJson = async (root, name, value) =>
  await writeFile(path.join(root, name), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })

async function framePair(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}

function scaleProjectTitle(index) {
  return `Scale Project ${String(index).padStart(4, '0')}`
}

export async function writeScaleProject(
  filename,
  index,
  title,
  revision,
  identity,
  raster,
  workspaceId,
) {
  const { canvas, png } = raster
  const suffix = String(index).padStart(12, '0')
  const documentId = `2385c134-dc60-4fce-8ba5-${suffix}`
  const assets = {}
  const layers = [raster, ...(raster.additionalRasters ?? [])].map((layer, layerIndex) => {
    assert.deepEqual(layer.canvas, canvas)
    const layerId = `9f310111-d280-4db3-${9351 + layerIndex}-${suffix}`
    const assetPath = `assets/layers/${layerId}.png`
    assets[assetPath] = { bytes: layer.png }
    return {
      asset: {
        bytes: layer.png.length,
        height: canvas.height,
        path: assetPath,
        sha256: layer.pngSha256,
        width: canvas.width,
      },
      blendMode: 'normal',
      id: layerId,
      kind: 'raster',
      locked: false,
      name: layerIndex === 0 ? 'Scale fixture raster' : `Scale fixture raster ${layerIndex + 1}`,
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: layerIndex === 0,
    }
  })
  const project = parseProjectDocumentV1({
    ...createEmptyProjectDocumentV1({
      documentId,
      documentRevision: revision,
      primaryBbox: canvas,
      title,
    }),
    layers,
  })
  await saveIgsPackage(filename, {
    assets,
    preview: { merged: png, rect: canvas, status: 'rendered', thumbnail },
    project,
  })
  await regularFile(filename)
  return {
    bytes: await identity(filename),
    documentId,
    id: `project-v1-${createHash('sha256').update(filename).digest('hex')}`,
    revision,
    title,
    workspaceId,
  }
}

export async function stageProject(workspace, index, identity, raster) {
  const title = scaleProjectTitle(index)
  const filename = path.join(workspace.directoryPath, `${title}.igs`)
  const revision = `e98c6d46-5794-4dbb-9424-${String(index).padStart(12, '0')}`
  return await writeScaleProject(filename, index, title, revision, identity, raster, workspace.id)
}

export async function stageProjects(workspaces, identity, raster) {
  const files = []
  for (const workspace of workspaces) {
    for (let index = 0; index < workspace.projectCount; index++) {
      files.push(await stageProject(workspace, files.length + 1, identity, raster))
    }
  }
  return files
}

export async function assertSavedState(workspaces, database, files, identity, missing) {
  for (const { directoryPath, id } of workspaces) {
    assert.deepEqual(
      (await readdir(directoryPath)).sort(),
      files
        .filter((file) => file.workspaceId === id)
        .map(({ bytes }) => path.basename(bytes.path))
        .sort(),
    )
  }
  for (const { bytes } of files) {
    await regularFile(bytes.path)
    assert.deepEqual(await identity(bytes.path), bytes)
  }

  const snapshot = indexSnapshot(database)
  const expected = files.map(({ bytes, documentId, id, revision, title, workspaceId }) => ({
    bytes: bytes.sizeBytes,
    diagnostic: null,
    documentId,
    filename: bytes.path,
    health: 'ready',
    id,
    preview: 'rendered',
    revision,
    title,
    trashedAt: null,
    workspace: workspaceId,
  }))
  if (missing) {
    const { original, detached } = missing
    await assert.rejects(lstat(original.bytes.path), { code: 'ENOENT' })
    await regularFile(detached.path)
    assert.deepEqual(await identity(detached.path), detached)
    expected.push({
      bytes: null,
      diagnostic: 'FILE_MISSING',
      documentId: original.documentId,
      filename: original.bytes.path,
      health: 'missing',
      id: original.id,
      preview: 'rendered',
      revision: original.revision,
      title: original.title,
      trashedAt: null,
      workspace: original.workspaceId,
    })
  }
  expected.sort((left, right) => left.id.localeCompare(right.id))
  assert.deepEqual(snapshot, { accepted: [], jobs: 0, projects: expected, receipts: 0, seeds: 0 })
  return { ...snapshot, database: await identity(database) }
}

async function rendererCounters(page) {
  const session = await page.context().newCDPSession(page)
  try {
    return {
      dom: await session.send('Memory.getDOMCounters'),
      heap: await session.send('Runtime.getHeapUsage'),
    }
  } finally {
    await session.detach()
  }
}

async function measureRefresh(page, refresh, cards, count, root, name) {
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 60_000 })
  await refresh.evaluate((button) => {
    const transitions = [button.getAttribute('aria-busy')]
    const observer = new MutationObserver((records) => {
      // Preserve a busy-to-idle roundtrip even if both attribute mutations precede one callback.
      transitions.push(...records.slice(1).map(({ oldValue }) => oldValue))
      transitions.push(button.getAttribute('aria-busy'))
      if (transitions.includes('true') && transitions.at(-1) !== 'true') observer.disconnect()
    })
    observer.observe(button, { attributeFilter: ['aria-busy'], attributeOldValue: true })
    globalThis.__igsHomeScaleRefreshTransitions = transitions
  })
  const start = performance.now()
  try {
    await refresh.click()
    await page.waitForFunction(
      () => {
        const transitions = globalThis.__igsHomeScaleRefreshTransitions
        return transitions.includes('true') && transitions.at(-1) !== 'true'
      },
      undefined,
      { timeout: 60_000 },
    )
    await expect(cards).toHaveCount(count)
    await framePair(page)
    // A failed catalog read can settle the busy button and keep the previous cards.
    await expect(
      page
        .getByRole('region', { exact: true, name: 'Home' })
        .getByText(
          /^(Project action failed|Workspace list unavailable|Workspace needs attention|Trash unavailable)$/,
        ),
    ).toHaveCount(0)
  } catch (error) {
    await writeJson(root, `${name}-refresh-failure.json`, {
      ms: performance.now() - start,
      timedOut: error.name === 'TimeoutError',
      transitions: await page.evaluate(() => globalThis.__igsHomeScaleRefreshTransitions),
    })
    throw error
  }
  const ms = performance.now() - start
  return {
    ms,
    resultCount: count,
    timedOut: false,
    transitions: await page.evaluate(() => globalThis.__igsHomeScaleRefreshTransitions),
  }
}

async function assertCards(cards, files, timeout) {
  await expect(cards).toHaveCount(files.length, { timeout })
  const actual = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')).sort(),
  )
  assert.deepEqual(actual, files.map(({ title }) => `Select ${title}`).sort())
}

async function verifyExternalRefresh(page, root, workspace, files, identity) {
  const home = page.getByRole('region', { exact: true, name: 'Home' })
  const grid = home.getByRole('list', { exact: true, name: 'Project grid' })
  const cards = grid.getByRole('button', { name: /^Select / })
  const refresh = home.getByRole('button', { exact: true, name: 'Refresh projects' })
  const workspaceNav = home.getByRole('complementary', {
    exact: true,
    name: 'Workspace navigation',
  })
  const workspaceCount = (count) =>
    workspaceNav.getByRole('button', { exact: true, name: `Uncategorized ${count}` })
  await home.getByRole('textbox', { exact: true, name: 'Search projects' }).fill('')
  await assertCards(cards, files)
  await expect(workspaceCount(files.length)).toBeVisible()

  const [original, missing, ...neighbors] = files
  for (const file of [original, missing]) {
    await regularFile(file.bytes.path)
    assert.deepEqual(await identity(file.bytes.path), file.bytes)
  }
  const replacement = await writeScaleProject(
    original.bytes.path,
    1,
    `${original.title} Revised`,
    'e98c6d46-5794-4dbb-9425-000000000001',
    identity,
    tinyRaster,
    workspace.id,
  )
  assert.equal(replacement.documentId, original.documentId)
  assert.equal(replacement.id, original.id)
  assert.notEqual(replacement.revision, original.revision)
  assert.notEqual(replacement.bytes.sha256, original.bytes.sha256)

  const addedIndex = files.length + 1
  await assert.rejects(
    lstat(path.join(workspace.directoryPath, `${scaleProjectTitle(addedIndex)}.igs`)),
    { code: 'ENOENT' },
  )
  const added = await stageProject(workspace, addedIndex, identity, tinyRaster)
  const detachedDirectory = path.join(root, 'refresh-detached')
  await mkdir(detachedDirectory, { mode: 0o700 })
  const detachedPath = path.join(detachedDirectory, path.basename(missing.bytes.path))
  await rename(missing.bytes.path, detachedPath)
  await regularFile(detachedPath)
  const detached = await identity(detachedPath)
  assert.deepEqual(detached, { ...missing.bytes, path: detachedPath })

  const expectedFiles = [replacement, ...neighbors, added]
  await assertCards(cards, files)
  const refreshSample = await measureRefresh(
    page,
    refresh,
    cards,
    files.length + 1,
    root,
    'external',
  )
  await assertCards(cards, [...expectedFiles, missing])
  await expect(workspaceCount(files.length + 1)).toBeVisible()
  const missingCard = grid.locator(`[data-project-id="${missing.id}"]`)
  await expect(missingCard.getByText('File missing', { exact: true })).toBeVisible()
  await expect(
    missingCard.getByRole('button', { exact: true, name: `Open ${missing.title}` }),
  ).toBeDisabled()
  await expect(missingCard.locator('img')).toHaveCount(0)
  return {
    added,
    expectedFiles,
    missing: { detached, original: missing },
    refresh: refreshSample,
    replacement: { before: original, after: replacement },
    unchangedNeighbors: neighbors.length,
  }
}

async function measureHome(state, root, files, launchStart, canvas) {
  const { page } = state
  const visibleAt = state.homeVisibleAt ?? performance.now()
  const spawnAt = state.spawnedAt ?? launchStart
  const home = page.getByRole('region', { exact: true, name: 'Home' })
  const grid = home.getByRole('list', { exact: true, name: 'Project grid' })
  const list = home.getByRole('list', { exact: true, name: 'Project list' })
  const cards = grid.getByRole('button', { name: /^Select / })
  const select = (title) => grid.getByRole('button', { exact: true, name: `Select ${title}` })
  const count = files.length

  await assertCards(cards, files, 60_000)
  await expect(grid).toBeVisible()
  await framePair(page)
  const cardsReadyAt = performance.now()
  const viewportBeforeResize = await page.evaluate(() => ({
    dpr: devicePixelRatio,
    height: innerHeight,
    width: innerWidth,
  }))

  const native = []
  const nativeInput = await connectNativeInput(
    state,
    (observation) => native.push(observation),
    root,
  )
  await nativeInput.resize(900, 620)
  const settledMemory = await rendererCounters(page)
  const refresh = await measureRefresh(
    page,
    home.getByRole('button', { exact: true, name: 'Refresh projects' }),
    cards,
    count,
    root,
    state.name,
  )
  const search = home.getByRole('textbox', { exact: true, name: 'Search projects' })
  const searchSamples = []
  for (const index of [0, count / 4, count / 2, (count * 3) / 4, count - 1]) {
    const { title } = files[index]
    await search.fill('')
    await expect(cards).toHaveCount(count)
    await framePair(page)
    const start = performance.now()
    await search.fill(title)
    await expect(cards).toHaveCount(1)
    await expect(select(title)).toBeVisible()
    await framePair(page)
    searchSamples.push({ ms: performance.now() - start, resultCount: 1, title })
  }

  await search.fill('')
  await expect(cards).toHaveCount(count)
  await framePair(page)
  const layoutSamples = []
  for (let round = 1; round <= 3; round++) {
    for (const [view, rows] of [
      ['List', list],
      ['Grid', grid],
    ]) {
      const toggle = home.getByRole('button', { exact: true, name: `${view} view` })
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      const start = performance.now()
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(rows).toBeVisible()
      await expect(rows.getByRole('button', { name: /^Select / })).toHaveCount(count)
      await framePair(page)
      layoutSamples.push({ ms: performance.now() - start, resultCount: count, round, view })
    }
  }

  const inspector = home.getByRole('complementary', { exact: true, name: 'Project inspector' })
  const preview = inspector.getByRole('img', { exact: true, name: 'Project preview canvas' })
  const previewSamples = []
  for (const index of [0, count / 2, count - 1]) {
    const { id, title } = files[index]
    await search.fill(title)
    await expect(cards).toHaveCount(1)
    const card = select(title)
    await expect(card).toHaveAttribute('aria-pressed', 'false')
    await framePair(page)
    const start = performance.now()
    await card.click()
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(inspector.getByRole('heading', { exact: true, name: title })).toBeVisible()
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('data-preview-state', 'ready')
    await expect(preview).toHaveAttribute('data-image-width', String(canvas.width))
    await expect(preview).toHaveAttribute('data-image-height', String(canvas.height))
    const source = await preview.getAttribute('data-preview-url')
    assert.ok(source?.startsWith('igs-preview:') && source.includes(id))
    await framePair(page)
    previewSamples.push({
      height: canvas.height,
      ms: performance.now() - start,
      source,
      title,
      width: canvas.width,
    })
  }

  const homeTab = page.getByRole('tab', { exact: true, name: 'Home' })
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await page.screenshot({ path: path.join(root, `${state.name}-home.png`) })

  return {
    checks: {
      cardCount: count,
      cardNamesMatch: true,
      homeRemainedActive: true,
      layoutSamples: layoutSamples.length,
      previewSamples: previewSamples.length,
      searchSamples: searchSamples.length,
    },
    name: state.name,
    native,
    settledMemory,
    timings: {
      layouts: layoutSamples,
      previews: previewSamples,
      refresh,
      searches: searchSamples,
      startup: {
        allExpectedCardsMs: cardsReadyAt - spawnAt,
        shellMs: visibleAt - spawnAt,
        shellToAllExpectedCardsMs: cardsReadyAt - visibleAt,
        startBoundary: state.spawnedAt === undefined ? 'launch call' : 'before spawn',
        shellBoundary: state.homeVisibleAt === undefined ? 'launch return' : 'visible Home',
      },
    },
    viewportBeforeResize,
  }
}

export async function prepareWorkspaces(appData, projectCount, linked) {
  assert.ok(!linked || projectCount === 128 || projectCount === 256)
  const defaultWorkspace = {
    directoryPath: path.join(appData, 'workspaces/Uncategorized'),
    displayName: 'Uncategorized',
    id: 'uncategorized',
    projectCount: linked ? projectCount / 4 : projectCount,
  }
  await mkdir(defaultWorkspace.directoryPath, { mode: 0o700, recursive: true })
  const workspaces = [defaultWorkspace]
  if (linked) {
    const database = openAppDatabase(appData, migrations)
    try {
      const repository = new ProjectIndexRepository(database.db)
      const uncategorized = await repository.ensureDefaultWorkspace(appData)
      assert.equal(uncategorized.directoryPath, defaultWorkspace.directoryPath)
      assert.equal(uncategorized.id, defaultWorkspace.id)
      const linkedWorkspaceCount = (projectCount - defaultWorkspace.projectCount) / 2
      // Use current workspace registration, then leave discovery to the packaged app.
      for (const displayName of ['Scale Alpha', 'Scale Beta']) {
        const directoryPath = path.join(appData, 'workspaces', displayName)
        await mkdir(directoryPath, { mode: 0o700 })
        const workspace = await repository.addWorkspace(
          { color: 'teal', displayName },
          directoryPath,
        )
        assert.equal(workspace.directoryPath, directoryPath)
        workspaces.push({ ...workspace, projectCount: linkedWorkspaceCount })
      }
      assert.deepEqual(await repository.listProjects(), [])
    } finally {
      await database.close()
    }
  }
  for (const { directoryPath } of workspaces) {
    assert.equal(await realpath(directoryPath), directoryPath)
    assert.deepEqual(await readdir(directoryPath), [])
  }
  return workspaces
}

async function measureWorkspaceNavigation(state, root, workspaces, files) {
  const { page } = state
  const home = page.getByRole('region', { exact: true, name: 'Home' })
  const nav = home.getByRole('complementary', { exact: true, name: 'Workspace navigation' })
  const grid = home.getByRole('list', { exact: true, name: 'Project grid' })
  const cards = grid.getByRole('button', { name: /^Select / })
  const refresh = home.getByRole('button', { exact: true, name: 'Refresh projects' })
  const aggregate = nav.getByRole('button', { exact: true, name: 'Projects' })
  await home.getByRole('textbox', { exact: true, name: 'Search projects' }).fill('')
  await expect(aggregate).toHaveAttribute('aria-pressed', 'true')
  await assertCards(cards, files, 60_000)
  const timings = []
  for (const [index, workspace] of workspaces.entries()) {
    const { directoryPath, displayName, id, projectCount } = workspace
    const expected = files.filter((file) => file.workspaceId === id)
    assert.equal(expected.length, projectCount)
    const button = nav.getByRole('button', { exact: true, name: `${displayName} ${projectCount}` })
    await expect(button).toHaveAttribute('title', directoryPath)
    const start = performance.now()
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await assertCards(cards, expected, 60_000)
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 60_000 })
    await framePair(page)
    const result = { displayName, id, projectCount, selectMs: performance.now() - start }
    // One scoped refresh exercises counts and card membership without adding three more scans.
    if (index === workspaces.length - 1) {
      result.refresh = await measureRefresh(
        page,
        refresh,
        cards,
        projectCount,
        root,
        `${state.name}-scoped`,
      )
      await assertCards(cards, expected, 60_000)
    }
    timings.push(result)
  }
  const start = performance.now()
  await aggregate.click()
  await expect(aggregate).toHaveAttribute('aria-pressed', 'true')
  await assertCards(cards, files, 60_000)
  await framePair(page)
  const aggregateMs = performance.now() - start
  for (const { displayName, projectCount } of workspaces) {
    await expect(
      nav.getByRole('button', { exact: true, name: `${displayName} ${projectCount}` }),
    ).toBeVisible()
  }
  return { aggregateMs, workspaces: timings }
}

export async function runPackagedHomeScale({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  identity,
}) {
  const profile = process.env.IMAGEGEN_HOME_SCALE_FIXTURE
  const linked = ['linked-tiny', 'linked-raster', 'linked-layered'].includes(profile)
  const countArgument = process.env.IMAGEGEN_HOME_SCALE_PROJECTS
  const layered256 = profile === 'linked-layered' && countArgument === '256'
  assert.ok(
    linked
      ? countArgument === '128' || layered256
      : profile === undefined && ['32', '512'].includes(countArgument),
    'Use 32 or 512 by default, 128 with a linked profile, or 256 with linked-layered.',
  )
  assert.ok(
    !layered256 || process.env.IMAGEGEN_HOME_SCALE_SOFTWARE === '1',
    'The 256-project linked-layered profile requires software compositing.',
  )
  assert.ok(!linked || process.env.IMAGEGEN_HOME_SCALE_REFRESH_CONTROL === undefined)
  assert.ok(process.env.IMAGEGEN_CHOOSER_KWIN_PID, 'Use the isolated native KWin session.')
  const projectCount = Number(countArgument)
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(`${ownedRunRoot}${path.sep}`))
  await assertOfflineProjectDesktop({
    expectedPackage: proof.package,
    ownedRunRoot,
    packageBefore,
    root,
    scenario: 'home-scale',
    suite: 'packaged-home-scale',
  })
  if (process.env.IMAGEGEN_HOME_SCALE_SOFTWARE === '1') {
    const information = await sessionMethod(
      'org.kde.KWin',
      '/KWin',
      'org.kde.KWin.supportInformation',
    )
    assert.match(information, /llvmpipe|Compositing Type: QPainter|Compositing is not active/i)
    await writeJson(root, 'software-compositor.json', { information })
  }
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  assert.equal(await realpath(path.dirname(appData)), path.dirname(appData))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  const database = path.join(appData, 'database/app.sqlite')
  const workspaces = await prepareWorkspaces(appData, projectCount, linked)
  const raster =
    profile === 'linked-layered'
      ? layeredRasterFixture()
      : profile === 'linked-raster'
        ? largeRasterFixture()
        : tinyRaster
  const files = await stageProjects(workspaces, identity, raster)
  assert.equal(files.length, projectCount)
  const { canvas, png, pngSha256 } = raster
  const input = {
    files,
    preview: {
      height: canvas.height,
      pngBytes: png.length,
      pngSha256,
      thumbnailSha256,
      width: canvas.width,
    },
    totalBytes: files.reduce((bytes, file) => bytes + file.bytes.sizeBytes, 0),
    ...(linked && {
      layerSha256: [raster, ...(raster.additionalRasters ?? [])].map((layer) => layer.pngSha256),
      profile,
      workspaces,
    }),
  }
  await writeJson(root, 'home-scale-input.json', input)

  const lifetimes = []
  let freshness
  for (const name of ['first-index', 'indexed-restart']) {
    const launchStart = performance.now()
    const state = await launch(name)
    let measured
    try {
      measured = await measureHome(state, root, files, launchStart, canvas)
      if (linked) {
        measured.navigation = await measureWorkspaceNavigation(state, root, workspaces, files)
      }
      if (name === 'indexed-restart' && process.env.IMAGEGEN_HOME_SCALE_REFRESH_CONTROL === '1') {
        freshness = await verifyExternalRefresh(state.page, root, workspaces[0], files, identity)
      }
    } finally {
      await closeNormally(state)
    }
    const checked = await assertSavedState(
      workspaces,
      database,
      freshness?.expectedFiles ?? files,
      identity,
      freshness?.missing,
    )
    const result = {
      ...measured,
      database: checked.database,
      filesUnchanged: !freshness,
      indexedProjects: checked.projects.length,
      normalPhysicalExit: state.normalPhysicalExit,
    }
    await writeJson(root, `${name}-measurements.json`, result)
    lifetimes.push(result)
    if (freshness) {
      const { expectedFiles: _expected, ...controls } = freshness
      await writeJson(root, 'home-scale-refresh-control.json', { ...controls, ...checked })
    }
  }

  return {
    filesUnchanged: !freshness,
    input,
    lifetimes,
    measurement: {
      initialList:
        'Exact rendered card names followed by two renderer frames, before native resize',
      interactions:
        'Before Playwright action to expected UI and two renderer frames in the same driver clock',
      restart: 'Same closed AppData and OS cache state',
    },
    package: packageBefore,
    projectCount,
    ...(freshness && { refreshControl: 'home-scale-refresh-control.json' }),
  }
}
