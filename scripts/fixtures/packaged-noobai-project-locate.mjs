/** Real system-picker Locate for an externally renamed, previously opened portable Project. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import {
  assertOpened,
  assertOriginalBytes,
  chooseProject,
  indexSnapshot,
  regularFile,
  verifyChooserFixture,
} from './packaged-noobai-import-chooser.mjs'

const execute = promisify(execFile)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const projectId = (filename) => `project-v1-${sha256(filename)}`
const differentRevision = '2879c603-0c5a-4f3c-90db-d1d546e28625'

async function zipMember(file, entry) {
  const { stdout } = await execute('/usr/bin/unzip', ['-p', file, entry], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
    timeout: 4000,
  })
  return stdout
}

async function prepareDifferentRevision(original, file, metadataDirectory, saved) {
  const project = JSON.parse(await zipMember(original, 'project.json'))
  const manifest = JSON.parse(await zipMember(original, 'manifest.json'))
  assert.equal(project.documentId, saved.documentId)
  assert.equal(project.documentRevision, saved.revision)
  assert.equal(manifest.documentRevision, saved.revision)
  assert.notEqual(saved.revision, differentRevision)
  project.documentRevision = differentRevision
  manifest.documentRevision = differentRevision
  const bytes = Buffer.from(JSON.stringify(project))
  const member = manifest.members.find(({ path: entry }) => entry === 'project.json')
  assert.ok(member)
  member.bytes = bytes.length
  member.sha256 = sha256(bytes)
  await mkdir(metadataDirectory, { mode: 0o700 })
  const projectFile = path.join(metadataDirectory, 'project.json')
  const manifestFile = path.join(metadataDirectory, 'manifest.json')
  await writeFile(projectFile, bytes, { flag: 'wx', mode: 0o600 })
  await writeFile(manifestFile, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
  await copyFile(original, file, constants.COPYFILE_EXCL)
  await execute('/usr/bin/zip', ['-q', '-X', '-j', file, manifestFile, projectFile], {
    timeout: 5000,
  })
  assert.deepEqual(await zipMember(file, 'project.json'), bytes)
  assert.deepEqual(JSON.parse(await zipMember(file, 'manifest.json')), manifest)
}

function locationSnapshot(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    return {
      bindings: db
        .prepare(
          `SELECT local_project_key AS id, canonical_path AS filename, document_id AS documentId
           FROM project_identity_binding ORDER BY local_project_key`,
        )
        .all(),
      opened: Object.fromEntries(
        db.prepare('SELECT local_project_key, last_opened_at FROM project_index').raw().all(),
      ),
      maintenance: Object.fromEntries(
        [
          'project_identity_retired_key',
          'project_relocation',
          'project_file_lifecycle',
          'generation_acceptance_journal',
          'generation_staging_discarded_session',
        ].map((table) => [table, db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()]),
      ),
    }
  } finally {
    db.close()
  }
}

async function registerLocateDestination(state, directory) {
  const { driveKdeDirectoryChooser } = await import('./packaged-kde-chooser.mjs')
  const home = state.page.getByRole('region', { name: 'Home', exact: true })
  const dialog = state.page.getByRole('dialog', { name: 'Add Workspace', exact: true })
  await home.getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await dialog
    .getByRole('textbox', { name: 'Workspace name', exact: true })
    .fill('Locate Destination')
  const choice = await driveKdeDirectoryChooser({
    state,
    source: directory,
    windowTitle: 'Add Workspace',
    trigger: dialog.getByRole('button', { name: 'Choose Folder and Add', exact: true }),
  })
  await expect(dialog).toHaveCount(0)
  const navigation = home.getByRole('complementary', { name: 'Workspace navigation' })
  await expect(
    navigation.getByRole('button', { name: 'Locate Destination 0', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await navigation.getByRole('button', { name: 'Projects', exact: true }).click()
  return choice
}

export async function runPortableLocate({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const crossWorkspaceFlag = process.env.IMAGEGEN_PORTABLE_LOCATE_CROSS_WORKSPACE
  assert.ok(crossWorkspaceFlag === undefined || crossWorkspaceFlag === '1')
  const crossWorkspace = crossWorkspaceFlag === '1'
  const inspectorCancel = process.env.IMAGEGEN_PORTABLE_LOCATE_INSPECTOR_CANCEL
  assert.ok(inspectorCancel === undefined || (crossWorkspace && inspectorCancel === '1'))
  let expectedPackage
  if (crossWorkspace) {
    assert.ok(process.env.IMAGEGEN_CHOOSER_KWIN_PID, 'Use the private KDE directory chooser.')
    const proof = JSON.parse(
      await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
    )
    assert.equal(proof.schemaVersion, 1)
    assert.ok(proof.package.path.startsWith(ownedRunRoot + path.sep))
    expectedPackage = proof.package
  }
  const original = await verifyChooserFixture({
    scenario: 'locate',
    root,
    ownedRunRoot,
    packageBefore,
    identity,
    expectedPackage,
  })
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const destinationWorkspace = crossWorkspace ? path.join(root, 'Locate Destination') : workspace
  if (crossWorkspace) await mkdir(destinationWorkspace, { mode: 0o700 })
  const oldPath = path.join(workspace, 'Original NoobAI.igs')
  const locatedPath = path.join(destinationWorkspace, 'Located NoobAI.igs')
  const alternatePath = path.join(destinationWorkspace, 'Different revision.igs')
  const externalPath = path.join(root, 'External NoobAI.igs')
  const db = path.join(appData, 'database/app.sqlite')
  const id = projectId(oldPath)
  const foundId = projectId(locatedPath)
  const alternateId = projectId(alternatePath)
  const row = (state, key) => state.page.locator(`.project-row[data-project-id="${key}"]`)
  const snapshot = () => ({ ...indexSnapshot(db), ...locationSnapshot(db) })

  await copyFile(original.path, oldPath, constants.COPYFILE_EXCL)
  const initial = await launch('open-before-external-rename')
  const registration = crossWorkspace
    ? await registerLocateDestination(initial, destinationWorkspace)
    : undefined
  const initialPorts = await readPorts(initial)
  assert.equal(initialPorts.projects.value.length, 1)
  const destination = initialPorts.workspaces.value.find(
    ({ directoryPath }) => directoryPath === destinationWorkspace,
  )
  assert.ok(destination)
  const [initialRow] = indexSnapshot(db).projects
  assert.equal(initialRow.id, id)
  assert.equal(initialRow.filename, oldPath)
  assert.equal(initialRow.health, 'ready')
  assert.equal(initialRow.workspace, 'uncategorized')
  if (crossWorkspace) assert.notEqual(destination.id, initialRow.workspace)
  const open = (state) =>
    row(state, id).getByRole('button', { name: `Open ${initialRow.title}`, exact: true })
  await open(initial).click()
  await assertOpened(initial, id)
  await closeNormally(initial)
  const saved = await retainOwnStore('before-external-rename')
  const before = snapshot()
  assert.deepEqual(before.bindings, [])
  assert.ok(before.opened[id])
  assert.equal(before.accepted.length, 1)
  assert.deepEqual([before.jobs, before.receipts, before.seeds], [0, 0, 0])
  assert.ok(Object.values(before.maintenance).every((count) => count === 0))
  await assertOriginalBytes(oldPath, identity)
  const { ino, dev } = await regularFile(oldPath)
  // This is an external rename of our closed fixture on the same owned filesystem.
  await assert.rejects(lstat(locatedPath), { code: 'ENOENT' })
  await rename(oldPath, locatedPath)
  await copyFile(original.path, externalPath, constants.COPYFILE_EXCL)
  await prepareDifferentRevision(
    original.path,
    alternatePath,
    path.join(root, 'alternate-metadata'),
    initialRow,
  )
  const alternate = await identity(alternatePath)
  await copyFile(alternatePath, path.join(root, 'different-revision.igs'), constants.COPYFILE_EXCL)
  const fileWitness = async (filename) => {
    const { ino, dev } = await regularFile(filename)
    return { filename, ino, dev }
  }
  const witnesses = await Promise.all([locatedPath, externalPath, alternatePath].map(fileWitness))
  assert.deepEqual(witnesses[0], { filename: locatedPath, ino, dev })
  const assertFiles = async () => {
    await assert.rejects(lstat(oldPath), { code: 'ENOENT' })
    for (const file of [original.path, locatedPath, externalPath]) {
      await assertOriginalBytes(file, identity)
    }
    assert.deepEqual(
      await Promise.all(witnesses.map(({ filename }) => fileWitness(filename))),
      witnesses,
    )
    assert.deepEqual(await identity(alternatePath), alternate)
    if (crossWorkspace) assert.deepEqual(await readdir(workspace), [])
    assert.deepEqual((await readdir(destinationWorkspace)).sort(), [
      path.basename(alternatePath),
      path.basename(locatedPath),
    ])
  }

  const current = await launch('locate-missing-project')
  assert.equal((await readPorts(current)).projects.value.length, 3)
  const home = current.page.getByRole('region', { name: 'Home', exact: true })
  const missing = row(current, id).getByText('File missing', { exact: true })
  const noTab = current.page.getByRole('tab', { name: initialRow.title, exact: true })
  const action = row(current, id).getByRole('button', {
    name: `${initialRow.title} project actions`,
    exact: true,
  })
  const error = home.getByRole('alert').filter({ hasText: 'Project action failed' })
  await expect(missing).toBeVisible()
  const pending = snapshot()
  const find = (data, key) => data.projects.find(({ id: rowId }) => key === rowId)
  assert.equal(find(pending, id).health, 'missing')
  assert.equal(find(pending, id).filename, oldPath)
  assert.equal(find(pending, id).documentId, initialRow.documentId)
  assert.equal(find(pending, id).revision, initialRow.revision)
  assert.deepEqual(find(pending, foundId), {
    ...initialRow,
    id: foundId,
    filename: locatedPath,
    workspace: destination.id,
  })
  assert.deepEqual(find(pending, alternateId), {
    ...initialRow,
    id: alternateId,
    filename: alternatePath,
    revision: differentRevision,
    bytes: alternate.sizeBytes,
    workspace: destination.id,
  })
  assert.deepEqual(pending.bindings, [])
  assert.deepEqual(pending.maintenance, before.maintenance)
  assert.deepEqual([pending.jobs, pending.receipts, pending.seeds], [0, 0, 0])
  assert.deepEqual(pending.opened, {
    [id]: before.opened[id],
    [foundId]: null,
    [alternateId]: null,
  })
  const chooser = []
  async function select(source) {
    await action.click()
    await chooseProject({
      state: current,
      source,
      observations: chooser,
      windowTitle: 'Locate Project',
      trigger: current.page.locator('.n-dropdown-option-body__label:visible').filter({
        hasText: /^Locate Project$/,
      }),
    })
  }
  async function assertRefused(message) {
    await expect(action).toBeEnabled()
    if (message) await expect(error).toContainText(message)
    else await expect(error).toBeHidden()
    await expect(missing).toBeVisible()
    await expect(noTab).toHaveCount(0)
    assert.deepEqual(snapshot(), pending)
    await assertFiles()
  }
  let cancelFocusScreenshot
  if (inspectorCancel) {
    const { driveKdeChooser } = await import('./packaged-kde-chooser.mjs')
    const selection = row(current, id).getByRole('button', {
      name: `Select ${initialRow.title}`,
      exact: true,
    })
    await selection.press('Enter')
    await expect(selection).toHaveAttribute('aria-pressed', 'true')
    const trigger = home
      .getByRole('complementary', { name: 'Project inspector', exact: true })
      .getByRole('button', { name: 'Locate Project', exact: true })
    chooser.push(
      await driveKdeChooser({
        state: current,
        windowTitle: 'Locate Project',
        trigger,
        activate: () => trigger.press('Enter'),
      }),
    )
    await expect(trigger).toBeEnabled()
    cancelFocusScreenshot = path.join(root, 'after-locate-cancel.png')
    await current.page.screenshot({ path: cancelFocusScreenshot, animations: 'disabled' })
    await expect(trigger).toBeFocused()
    assert.equal(await trigger.evaluate((element) => element.matches(':focus-visible')), true)
  } else {
    await select()
  }
  await assertRefused()
  await select(externalPath)
  await assertRefused('Choose a file directly inside a registered workspace.')
  await select(alternatePath)
  await assertRefused('No file was moved or replaced.')
  await select(locatedPath)
  await expect(open(current)).toBeVisible()
  await expect(row(current, foundId)).toHaveCount(0)
  await expect(noTab).toHaveCount(0)
  await expect(error).toBeHidden()
  const located = snapshot()
  assert.deepEqual(located, {
    ...pending,
    projects: pending.projects
      .filter(({ id: key }) => key !== foundId)
      .map((entry) =>
        entry.id === id
          ? { ...initialRow, filename: locatedPath, workspace: destination.id }
          : entry,
      ),
    accepted: [
      ...before.accepted,
      { ...before.accepted[0], id: alternateId, revision: differentRevision },
    ].sort((a, b) => a.id.localeCompare(b.id)),
    bindings: [{ id, filename: locatedPath, documentId: initialRow.documentId }],
    opened: { [id]: before.opened[id], [alternateId]: null },
  })
  await assertFiles()
  await closeNormally(current)
  const afterLocate = await retainOwnStore(
    'after-locate-before-open',
    path.basename(locatedPath),
    destinationWorkspace,
  )

  const restart = await launch('open-after-locate-restart')
  const restartPorts = await readPorts(restart)
  assert.equal(restartPorts.projects.value.length, 2)
  if (crossWorkspace) {
    assert.deepEqual(
      restartPorts.workspaces.value
        .map(({ id, directoryPath }) => ({ id, directoryPath }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      initialPorts.workspaces.value
        .map(({ id, directoryPath }) => ({ id, directoryPath }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
    const navigation = restart.page.getByRole('complementary', { name: 'Workspace navigation' })
    await expect(
      navigation.getByRole('button', { name: 'Uncategorized 0', exact: true }),
    ).toBeVisible()
    await navigation.getByRole('button', { name: 'Locate Destination 2', exact: true }).click()
    await expect(open(restart)).toBeVisible()
  }
  await expect(row(restart, foundId)).toHaveCount(0)
  await expect(restart.page.getByRole('tab', { name: initialRow.title, exact: true })).toHaveCount(
    0,
  )
  assert.deepEqual(snapshot(), located)
  await open(restart).click()
  await assertOpened(restart, id)
  await closeNormally(restart)
  const restarted = await retainOwnStore(
    'after-located-open',
    path.basename(locatedPath),
    destinationWorkspace,
  )
  const reopened = snapshot()
  assert.ok(reopened.opened[id] > located.opened[id])
  assert.deepEqual(reopened, {
    ...located,
    opened: { ...located.opened, [id]: reopened.opened[id] },
  })
  await assertFiles()
  return {
    saved,
    restarted,
    portableNoobaiLocate: {
      ...(crossWorkspace && { registration, destination, sourceWorkspaceId: initialRow.workspace }),
      ...(cancelFocusScreenshot && { cancelFocusScreenshot }),
      chooser,
      original,
      alternate,
      files: { oldPath, locatedPath, alternatePath, externalPath },
      witnesses,
      before,
      pending,
      located,
      reopened,
      afterLocate,
    },
  }
}
