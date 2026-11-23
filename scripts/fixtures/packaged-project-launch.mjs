/** Exercise the stock AppImage's cold and single-instance Project launch paths. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { ProjectSession } from '../../src/main/projects/project-session.ts'
import {
  assertOfflineProjectDesktop,
  indexSnapshot,
  regularFile,
} from './packaged-noobai-import-chooser.mjs'

const placeholdersDir = fileURLToPath(
  new URL('../../src/main/projects/placeholders/', import.meta.url),
)

async function witness(filename, identity) {
  await regularFile(filename)
  const { dev, ino, mode, mtimeNs } = await lstat(filename, { bigint: true })
  return {
    ...(await identity(filename)),
    device: String(dev),
    inode: String(ino),
    mode: String(mode),
    mtimeNs: String(mtimeNs),
  }
}

async function seedProject(directory, title, scratchDir, identity) {
  const filename = path.join(directory, `${title}.igs`)
  const session = await ProjectSession.create(filename, title, { placeholdersDir, scratchDir })
  const { documentId, documentRevision: revision, primaryBbox } = session.document
  return {
    id: 'project-v1-' + createHash('sha256').update(filename).digest('hex'),
    documentId,
    revision,
    title,
    primaryBbox,
    file: await witness(filename, identity),
  }
}

function tabs(page) {
  return page.getByRole('tablist', { name: 'Open documents', exact: true })
}

function tab(page, project) {
  return tabs(page).getByRole('tab', { name: project.title, exact: true })
}

function importDialog(page) {
  return page.getByRole('dialog', { name: 'Import Project', exact: true })
}

function promptPreview(page) {
  return page.getByRole('dialog', { name: 'Dynamic Prompt Preview', exact: true })
}

async function observeNextLaunch(page) {
  // A secondary exit alone cannot prove that its launch reached the open dialog.
  await page.evaluate(() => {
    window.__igsDeferredLaunchNotified = false
    const unsubscribe = window.api.projects.onLaunchImportAvailable(() => {
      window.__igsDeferredLaunchNotified = true
      unsubscribe()
    })
  })
}

async function expectTabs(page, selected, open) {
  await expect(tab(page, selected)).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() =>
      tabs(page)
        .getByRole('tab')
        .evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute('aria-label'))
            .filter((title) => title !== 'Home')
            .sort(),
        ),
    )
    .toEqual(open.map(({ title }) => title).sort())
}

async function readAlreadyOpen(page, project) {
  // Read only after the UI independently proves this Project is already open.
  const reply = await page.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(reply.ok, true, JSON.stringify(reply))
  assert.equal(reply.value.kind, 'opened')
  const current = reply.value.tab
  assert.equal(current.id, project.id)
  assert.equal(current.title, project.title)
  assert.equal(current.documentId, project.documentId)
  return current
}

function expectClean(current, project) {
  assert.equal(current.documentRevision, project.revision)
  assert.equal(current.dirty, false)
  assert.equal(current.canUndo, false)
  assert.equal(current.canRedo, false)
  assert.deepEqual(current.primaryBbox, project.primaryBbox)
}

function expectedCatalog(projects) {
  return {
    projects: projects
      .map(({ id, documentId, revision, title, file }) => ({
        id,
        documentId,
        revision,
        title,
        filename: file.path,
        health: 'ready',
        workspace: 'uncategorized',
        preview: 'empty',
        bytes: file.sizeBytes,
        diagnostic: null,
        trashedAt: null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    accepted: [],
    jobs: 0,
    receipts: 0,
    seeds: 0,
  }
}

async function retainIndex(root, database, name, expected, identity) {
  const wal = await lstat(`${database}-wal`).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  assert.ok(!wal || wal.size === 0)
  await regularFile(database)
  const file = path.join(root, `${name}.sqlite`)
  await copyFile(database, file, constants.COPYFILE_EXCL)
  const bytes = await identity(file)
  assert.deepEqual(bytes, { ...(await identity(database)), path: file })
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    db.close()
  }
  const catalog = indexSnapshot(file)
  assert.deepEqual(catalog, expected)
  return { bytes, catalog }
}

async function discardFixtureEdit(page, project) {
  const preview = promptPreview(page)
  if (await preview.isVisible()) {
    await preview.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(preview).toBeHidden()
  }
  const dialog = importDialog(page)
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  const projectTab = tab(page, project)
  if (!(await projectTab.getByLabel('Unsaved changes', { exact: true }).isVisible())) return
  await projectTab.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const decision = page.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(decision).toContainText(project.title)
  await decision.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  await expect(projectTab).toHaveCount(0)
}

export async function runPackagedProjectLaunch({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  launchSecondary,
  identity,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(ownedRunRoot + path.sep))
  await assertOfflineProjectDesktop({
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
    scenario: 'project-launch',
    suite: 'packaged-project-launch',
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })

  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const outside = path.join(root, 'external collection')
  const scratchDir = path.join(root, 'project-fixture-scratch')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await mkdir(outside, { mode: 0o700 })
  await mkdir(scratchDir, { mode: 0o700 })
  for (const directory of [workspace, outside, scratchDir]) {
    assert.equal(await realpath(directory), directory)
  }
  const first = await seedProject(workspace, 'Managed harbor', scratchDir, identity)
  const second = await seedProject(workspace, 'Managed dune', scratchDir, identity)
  const external = await seedProject(outside, 'Outside sketch', scratchDir, identity)
  const files = [first, second, external]
  const expected = expectedCatalog([first, second])
  const database = path.join(appData, 'database/app.sqlite')
  const assertFiles = async () => {
    for (const { file } of files) assert.deepEqual(await witness(file.path, identity), file)
    assert.deepEqual(
      (await readdir(workspace)).sort(),
      [path.basename(first.file.path), path.basename(second.file.path)].sort(),
    )
    assert.deepEqual(await readdir(outside), [path.basename(external.file.path)])
  }

  const primary = await launch('cold', packageBefore.path, [first.file.path])
  const { page } = primary
  let cold
  let openedWarm
  let edited
  let retainedEdit
  let refocusedWarm
  let externalWarm
  let deferredWarm
  let deferredPreview
  let retainedAfterCancel
  try {
    await expectTabs(page, first, [first])
    cold = await readAlreadyOpen(page, first)
    expectClean(cold, first)
    const width = page.getByLabel('Generation area width', { exact: true })
    const changedWidth = first.primaryBbox.width + 128
    await width.fill(String(changedWidth))
    await width.press('Enter')
    await expect(tab(page, first).getByLabel('Unsaved changes', { exact: true })).toBeVisible()
    edited = await readAlreadyOpen(page, first)
    assert.equal(edited.dirty, true)
    assert.equal(edited.canUndo, true)
    assert.deepEqual(edited.primaryBbox, { ...first.primaryBbox, width: changedWidth })
    await assertFiles()

    // A space-containing relative argument must resolve against the secondary's owned cwd.
    openedWarm = await launchSecondary(primary, [`./${path.basename(second.file.path)}`], workspace)
    await expectTabs(page, second, [first, second])
    expectClean(await readAlreadyOpen(page, second), second)

    refocusedWarm = await launchSecondary(primary, [first.file.path])
    await expectTabs(page, first, [first, second])
    retainedEdit = await readAlreadyOpen(page, first)
    assert.deepEqual(retainedEdit, edited)
    await expect(tab(page, first).getByLabel('Unsaved changes', { exact: true })).toBeVisible()

    externalWarm = await launchSecondary(primary, [external.file.path])
    const dialog = importDialog(page)
    await expect(dialog).toContainText(external.title)
    await expect(dialog).toContainText(path.basename(external.file.path))
    await expect(dialog.getByLabel('Import workspace', { exact: true })).toBeVisible()
    await expect(tab(page, external)).toHaveCount(0)
    await assertFiles()
    assert.deepEqual(indexSnapshot(database), expected)
    await page.screenshot({ path: path.join(root, 'external-launch-import-confirmation.png') })

    await observeNextLaunch(page)
    deferredWarm = await launchSecondary(primary, [second.file.path])
    await page.waitForFunction(() => window.__igsDeferredLaunchNotified === true)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(external.title)
    await expectTabs(page, first, [first, second])
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expectTabs(page, second, [first, second])
    await expect(tab(page, first).getByLabel('Unsaved changes', { exact: true })).toBeVisible()
    retainedAfterCancel = await readAlreadyOpen(page, first)
    assert.deepEqual(retainedAfterCancel, edited)
    await expectTabs(page, second, [first, second])
    await assertFiles()
    assert.deepEqual(indexSnapshot(database), expected)

    await page.getByLabel('Preview dynamic prompt', { exact: true }).first().click()
    const preview = promptPreview(page)
    await expect(preview).toBeVisible()
    await observeNextLaunch(page)
    deferredPreview = await launchSecondary(primary, [first.file.path])
    await page.waitForFunction(() => window.__igsDeferredLaunchNotified === true)
    await expect(preview).toBeVisible()
    await expectTabs(page, second, [first, second])
    await preview.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(preview).toBeHidden()
    await expectTabs(page, first, [first, second])
    assert.deepEqual(await readAlreadyOpen(page, first), edited)

    await discardFixtureEdit(page, first)
    await expectTabs(page, second, [second])
  } catch (error) {
    await writeFile(
      path.join(root, 'launch-ui-on-failure.json'),
      JSON.stringify(
        {
          tabs: await page.getByRole('tab').allTextContents(),
          homeVisible: await page.getByRole('region', { name: 'Home', exact: true }).isVisible(),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    throw error
  } finally {
    await discardFixtureEdit(page, first)
    await closeNormally(primary)
  }
  const firstIndex = await retainIndex(root, database, 'cold', expected, identity)
  await assertFiles()

  const restarted = await launch('reopened', packageBefore.path, [first.file.path])
  let reopened
  try {
    await expectTabs(restarted.page, first, [first])
    reopened = await readAlreadyOpen(restarted.page, first)
    expectClean(reopened, first)
    await expect(importDialog(restarted.page)).toBeHidden()
  } finally {
    await closeNormally(restarted)
  }
  const reopenedIndex = await retainIndex(root, database, 'reopened', expected, identity)
  await assertFiles()

  const result = {
    inputs: { first, second, external },
    opened: { cold, edited, retainedEdit, retainedAfterCancel, reopened },
    closed: { firstIndex, reopenedIndex },
    secondary: { openedWarm, refocusedWarm, externalWarm, deferredWarm, deferredPreview },
  }
  await writeFile(
    path.join(root, 'project-launch-proof.json'),
    JSON.stringify(result, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  return result
}
