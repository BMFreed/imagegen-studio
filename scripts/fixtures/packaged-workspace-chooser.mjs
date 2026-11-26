/** Exercise the real KDE folder chooser and the packaged workspace owners. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { ProjectSession } from '../../src/main/projects/project-session.ts'
import {
  keyboardWorkspaceColor,
  qualifyAddWorkspaceKeyboard,
} from './packaged-add-workspace-keyboard.mjs'
import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'
import { driveKdeDirectoryChooser } from './packaged-kde-chooser.mjs'
import {
  assertOfflineProjectDesktop,
  indexSnapshot,
  regularFile,
} from './packaged-noobai-import-chooser.mjs'

const displayName = 'Studio Collection'
const placeholdersDir = fileURLToPath(
  new URL('../../src/main/projects/placeholders/', import.meta.url),
)

function homeOf({ page }) {
  return page.getByRole('region', { exact: true, name: 'Home' })
}

function workspaceRow(state, name) {
  return homeOf(state)
    .getByRole('complementary', { name: 'Workspace navigation' })
    .getByRole('button', { exact: true, name })
}

function snapshot(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    return {
      catalog: indexSnapshot(filename),
      workspaces: db
        .prepare(
          'SELECT id, display_name AS displayName, directory_path AS directory, color, is_default AS isDefault FROM project_workspace ORDER BY id',
        )
        .all(),
      bindings: db
        .prepare(
          'SELECT local_project_key AS id, canonical_path AS filename, document_id AS documentId FROM project_identity_binding ORDER BY local_project_key',
        )
        .all(),
    }
  } finally {
    db.close()
  }
}

async function retainIndex(root, database, name, identity) {
  const wal = await lstat(database + '-wal').catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  assert.ok(!wal || wal.size === 0)
  const retained = path.join(root, name + '.sqlite')
  await regularFile(database)
  await copyFile(database, retained, constants.COPYFILE_EXCL)
  const bytes = await identity(retained)
  assert.deepEqual(bytes, { ...(await identity(database)), path: retained })
  const db = new Database(retained, { readonly: true, fileMustExist: true })
  try {
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    db.close()
  }
  return { bytes, ...snapshot(retained) }
}

async function projectFile(filename, title, scratchDir) {
  const session = await ProjectSession.create(filename, title, { placeholdersDir, scratchDir })
  const { documentId, documentRevision: revision } = session.document
  const id = 'project-v1-' + createHash('sha256').update(filename).digest('hex')
  return { documentId, id, revision, title }
}

async function fileWitness(filename, identity) {
  const bytes = await identity(filename)
  await regularFile(filename)
  const { dev, ino, mode, mtimeNs } = await lstat(filename, { bigint: true })
  return {
    ...bytes,
    device: String(dev),
    inode: String(ino),
    mode: String(mode),
    mtimeNs: String(mtimeNs),
  }
}

function expectedCatalog(workspace, projects) {
  return {
    accepted: [],
    jobs: 0,
    receipts: 0,
    seeds: 0,
    projects: projects
      .map(({ documentId, id, revision, title, file }) => ({
        bytes: file.sizeBytes,
        diagnostic: null,
        documentId,
        filename: file.path,
        health: 'ready',
        id,
        preview: 'empty',
        revision,
        title,
        trashedAt: null,
        workspace: workspace.id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function expectCatalog(snapshot, workspace, projects, appData, repointed = false) {
  const expectedWorkspaces = [
    { ...workspace },
    {
      id: 'uncategorized',
      directory: path.join(appData, 'workspaces/Uncategorized'),
      color: 'teal',
      displayName: 'Uncategorized',
      isDefault: 1,
    },
  ]
  assert.deepEqual(snapshot.workspaces, expectedWorkspaces)
  const catalog = expectedCatalog(workspace, projects)
  assert.deepEqual(snapshot.catalog, catalog)
  const bindings = repointed
    ? catalog.projects.map(({ documentId, filename, id }) => ({ documentId, filename, id }))
    : []
  assert.deepEqual(snapshot.bindings, bindings)
}

async function assertView(state, projects, directory, missing = false) {
  const nav = workspaceRow(state, `${displayName}${missing ? ' Missing' : ''} ${projects.length}`)
  await expect(nav).toHaveAttribute('title', directory)
  await expect(nav).toHaveAttribute('aria-pressed', 'true')
  const grid = homeOf(state).getByRole('list', { exact: true, name: 'Project grid' })
  await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(projects.length)
  for (const { id, title } of projects) {
    const card = grid.locator(`[data-project-id="${id}"]`)
    await expect(card.getByRole('button', { exact: true, name: `Select ${title}` })).toBeVisible()
    const open = card.getByRole('button', { exact: true, name: `Open ${title}` })
    if (missing) await expect(open).toBeDisabled()
    else await expect(open).toBeEnabled()
  }
  return nav
}

async function openProject(state, project) {
  await homeOf(state)
    .getByRole('button', { exact: true, name: `Open ${project.title}` })
    .click()
  await expect(state.page.getByRole('tab', { exact: true, name: project.title })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

export async function runPackagedWorkspaceChooser({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  identity,
  keyboard = false,
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
    scenario: 'workspace-chooser',
    suite: 'packaged-workspace-chooser',
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })

  const original = path.join(root, 'Original Collection')
  const moved = path.join(root, 'Moved Collection')
  const wrong = path.join(root, 'Different Collection')
  const nested = path.join(original, 'Nested')
  const scratch = path.join(root, 'project-fixture-scratch')
  for (const directory of [original, wrong, nested, scratch]) {
    await mkdir(directory, { mode: 0o700 })
    assert.equal(await realpath(directory), directory)
  }
  const database = path.join(appData, 'database/app.sqlite')
  const projects = []
  for (const [filename, title] of [
    ['A canvas.igs', 'Harbor sketch'],
    ['B canvas.igs', 'Dune study'],
  ]) {
    const source = path.join(original, filename)
    projects.push({
      ...(await projectFile(source, title, scratch)),
      file: await fileWitness(source, identity),
    })
  }
  const nestedPath = path.join(nested, 'Ignored project.igs')
  await projectFile(nestedPath, 'Ignored nested project', scratch)
  const nestedFile = await fileWitness(nestedPath, identity)
  const wrongPaths = projects.map(({ file }) => path.join(wrong, path.basename(file.path)))
  await copyFile(projects[0].file.path, wrongPaths[0], constants.COPYFILE_EXCL)
  await projectFile(wrongPaths[1], 'Different saved document', scratch)
  const wrongFiles = await Promise.all(wrongPaths.map((file) => fileWitness(file, identity)))
  assert.equal(wrongFiles[0].sha256, projects[0].file.sha256)
  assert.notEqual(wrongFiles[1].sha256, projects[1].file.sha256)

  const chooser = []
  const first = await launch('workspace-registration')
  const dialog = first.page.getByRole('dialog', { exact: true, name: 'Add Workspace' })
  const draft = dialog.getByRole('textbox', { exact: true, name: 'Workspace name' })
  const submit = dialog.getByRole('button', { exact: true, name: 'Choose Folder and Add' })
  await expect(workspaceRow(first, 'Uncategorized 0')).toBeVisible()
  const initial = snapshot(database)
  assert.equal(initial.workspaces.length, 1)
  assert.equal(initial.workspaces[0].id, 'uncategorized')
  assert.deepEqual(initial.catalog, { accepted: [], jobs: 0, projects: [], receipts: 0, seeds: 0 })
  assert.deepEqual(initial.bindings, [])
  const add = { state: first, windowTitle: 'Add Workspace', trigger: submit }
  let keyboardResult
  if (keyboard) {
    const checked = await qualifyAddWorkspaceKeyboard({ root, state: first, displayName })
    keyboardResult = checked.result
    chooser.push(...checked.chooser)
  } else {
    await homeOf(first).getByRole('button', { exact: true, name: 'Add Workspace' }).click()
    await draft.fill(displayName)
    chooser.push(await driveKdeDirectoryChooser(add))
  }
  await expect(submit).toBeEnabled()
  await expect(draft).toHaveValue(displayName)
  assert.deepEqual(snapshot(database), initial)
  chooser.push(await driveKdeDirectoryChooser({ ...add, source: original }))
  await expect(dialog).toHaveCount(0)
  await assertView(first, projects, original)
  const added = snapshot(database)
  const workspace = added.workspaces.find((row) => row.displayName === displayName)
  assert.match(workspace.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(workspace, {
    id: workspace.id,
    displayName,
    directory: original,
    color: keyboard ? keyboardWorkspaceColor : 'teal',
    isDefault: 0,
  })
  expectCatalog(added, workspace, projects, appData)
  await first.page.screenshot({ path: path.join(root, 'registered-workspace.png') })
  await openProject(first, projects[0])
  await closeNormally(first)
  const registeredIndex = await retainIndex(root, database, 'registered', identity)
  expectCatalog(registeredIndex, workspace, projects, appData)

  await assert.rejects(lstat(moved), { code: 'ENOENT' })
  for (const { file } of projects) assert.deepEqual(await fileWitness(file.path, identity), file)
  await rename(original, moved)
  await assert.rejects(lstat(original), { code: 'ENOENT' })
  const relocated = projects.map(({ file, ...project }) => ({
    ...project,
    file: { ...file, path: path.join(moved, path.basename(file.path)) },
  }))
  const movedNested = {
    ...nestedFile,
    path: path.join(moved, path.relative(original, nestedFile.path)),
  }

  const second = await launch('workspace-relocation')
  await workspaceRow(second, `${displayName} Missing 2`).click()
  await assertView(second, projects, original, true)
  const beforeLocate = snapshot(database)
  expectCatalog(beforeLocate, workspace, projects, appData)
  const locate = {
    state: second,
    windowTitle: 'Locate Workspace Folder',
    trigger: homeOf(second).getByRole('button', { exact: true, name: 'Locate Folder' }),
  }
  chooser.push(await driveKdeDirectoryChooser(locate))
  await expect(locate.trigger).toBeEnabled()
  assert.deepEqual(snapshot(database), beforeLocate)
  chooser.push(await driveKdeDirectoryChooser({ ...locate, source: wrong }))
  await expect(homeOf(second).getByText('Project action failed', { exact: true })).toBeVisible()
  await expect(
    homeOf(second).getByText(/The workspace or one of its saved Projects changed/),
  ).toBeVisible()
  await expect(locate.trigger).toBeEnabled()
  assert.deepEqual(snapshot(database), beforeLocate)
  chooser.push(await driveKdeDirectoryChooser({ ...locate, source: moved }))
  await assertView(second, relocated, moved)
  await expect(homeOf(second).getByText('Project action failed', { exact: true })).toHaveCount(0)
  await expect(second.page.getByRole('tab', { exact: true, name: 'Home' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await second.page.screenshot({ path: path.join(root, 'located-workspace.png') })
  const movedWorkspace = { ...workspace, directory: moved }
  expectCatalog(snapshot(database), movedWorkspace, relocated, appData, true)
  await closeNormally(second)
  const locatedIndex = await retainIndex(root, database, 'located', identity)
  expectCatalog(locatedIndex, movedWorkspace, relocated, appData, true)

  const third = await launch('workspace-reopened')
  const found = workspaceRow(third, `${displayName} 2`)
  await expect(found).toHaveAttribute('title', moved)
  await found.click()
  await assertView(third, relocated, moved)
  await openProject(third, relocated[1])
  await closeNormally(third)
  const reopenedIndex = await retainIndex(root, database, 'reopened', identity)
  expectCatalog(reopenedIndex, movedWorkspace, relocated, appData, true)
  await assert.rejects(lstat(original), { code: 'ENOENT' })
  for (const { file } of relocated) assert.deepEqual(await fileWitness(file.path, identity), file)
  assert.deepEqual(await fileWitness(movedNested.path, identity), movedNested)
  for (const file of wrongFiles) assert.deepEqual(await fileWitness(file.path, identity), file)
  assert.deepEqual((await readdir(moved)).sort(), ['A canvas.igs', 'B canvas.igs', 'Nested'])
  assert.deepEqual(await readdir(path.join(appData, 'workspaces/Uncategorized')), [])

  const result = {
    chooser,
    ...(keyboardResult && { keyboard: keyboardResult }),
    registeredIndex,
    locatedIndex,
    reopenedIndex,
    sourceProjects: projects,
    relocatedProjects: relocated,
    excludedFiles: [movedNested, ...wrongFiles],
  }
  await writeFile(
    path.join(root, 'workspace-chooser-proof.json'),
    JSON.stringify(result, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  if (keyboardResult) assert.deepEqual(keyboardResult.issues, [], 'Add Workspace keyboard findings')
  return result
}

function trashLifecycle(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    return {
      trash: db.prepare('SELECT * FROM project_file_lifecycle ORDER BY local_project_key').all(),
      retired: db
        .prepare(
          'SELECT local_project_key FROM project_identity_retired_key ORDER BY local_project_key',
        )
        .all(),
    }
  } finally {
    db.close()
  }
}

async function addWorkspaceFolder(state, name, source) {
  const dialog = state.page.getByRole('dialog', { exact: true, name: 'Add Workspace' })
  await homeOf(state).getByRole('button', { exact: true, name: 'Add Workspace' }).click()
  await dialog.getByRole('textbox', { exact: true, name: 'Workspace name' }).fill(name)
  const choice = await driveKdeDirectoryChooser({
    state,
    source,
    windowTitle: 'Add Workspace',
    trigger: dialog.getByRole('button', { exact: true, name: 'Choose Folder and Add' }),
  })
  await expect(dialog).toHaveCount(0)
  return choice
}

async function showWorkspaceTrash(state) {
  const home = homeOf(state)
  await home.getByRole('button', { name: /^Trash(?:\s+\d+)?$/ }).click()
  await expect(home.getByRole('heading', { exact: true, name: 'Trash' })).toBeVisible()
  await home.getByRole('button', { exact: true, name: 'List view' }).click()
  return home
}

function visibleTextColors(element) {
  const style = getComputedStyle(element)
  const backgrounds = []
  for (let node = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (color !== 'rgba(0, 0, 0, 0)') backgrounds.push(color)
  }
  return {
    text: element.textContent.trim(),
    foreground: style.color,
    backgrounds,
    fontSize: style.fontSize,
  }
}

function contrastRatio({ foreground, backgrounds }) {
  function over(back, color) {
    const values = color.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/)
    assert.ok(values, color)
    const opacity = Number(values[4] ?? 1)
    return back.map(
      (component, index) => component * (1 - opacity) + Number(values[index + 1]) * opacity,
    )
  }
  function luminance(rgb) {
    const linear = rgb.map((value) => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  assert.match(backgrounds.at(-1), /^rgb\(/, 'The measured background must resolve to opaque RGB.')
  const background = backgrounds.reduceRight(over, [0, 0, 0])
  const colors = [luminance(background), luminance(over(background, foreground))]
  return (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05)
}

async function removeFixtureWorkspace(state, root, keyboard) {
  const { page } = state
  const home = homeOf(state)
  const actions = home.getByRole('button', {
    exact: true,
    name: `${displayName} workspace actions`,
  })
  const remove = page.getByRole('dialog', { exact: true, name: 'Remove Workspace' })
  const confirm = remove.getByRole('button', { exact: true, name: 'Remove Workspace' })
  const open = async () => {
    await actions.click()
    await page
      .locator('.n-dropdown-option-body__label')
      .filter({ hasText: /^Remove Workspace$/ })
      .click()
    await expect(remove).toBeVisible()
  }
  if (!keyboard) {
    await open()
    await confirm.click()
    await expect(remove).toBeHidden()
    return null
  }

  const trace = path.join(root, 'workspace-removal-keyboard.ndjson')
  const record = (entry) => appendFile(trace, JSON.stringify(entry) + '\n', { mode: 0o600 })
  const input = await connectNativeInput(state, record, root)
  await input.resize(900, 620)
  await open()
  const cancel = remove.getByRole('button', { exact: true, name: 'Cancel' })
  await expect(cancel).toBeFocused()
  const ariaModal = await remove.getAttribute('aria-modal')
  await page.screenshot({
    path: path.join(root, 'workspace-removal-dialog.png'),
    animations: 'disabled',
  })
  const colors = await Promise.all(
    [remove.locator('p'), cancel, confirm].map(async (element) => {
      const sample = await element.evaluate(visibleTextColors)
      return { ...sample, ratio: contrastRatio(sample) }
    }),
  )
  await record({ phase: 'dialog-colors', ariaModal, colors })

  await input.press('shift+Tab', 'reverse-workspace-removal-focus-cycle')
  await expect(confirm).toBeFocused()
  await input.press('Tab', 'forward-workspace-removal-focus-cycle')
  await expect(cancel).toBeFocused()
  await input.press('Escape', 'cancel-workspace-removal')
  await expect(remove).toHaveCount(0)
  await expect(actions)
    .toBeFocused({ timeout: 2_000 })
    .catch(() => {})
  const escapeFocus = await actions.evaluate((element) => {
    const active = document.activeElement
    return {
      returnedToTrigger: element === active,
      tag: active?.tagName,
      label: active?.getAttribute('aria-label') ?? null,
      className: active?.getAttribute('class') ?? null,
      documentFocused: document.hasFocus(),
      disabled: element.disabled,
    }
  })
  await record({ phase: 'after-escape', ...escapeFocus })
  await page.screenshot({
    path: path.join(root, 'workspace-removal-cancel.png'),
    animations: 'disabled',
  })
  await open()
  await expect(cancel).toBeFocused()
  await input.press('Tab', 'focus-workspace-removal-confirmation')
  await expect(confirm).toBeFocused()
  await input.press('Return', 'confirm-workspace-removal')
  await expect(remove).toHaveCount(0)
  const search = home.getByRole('textbox', { exact: true, name: 'Search projects' })
  await expect(search)
    .toBeFocused({ timeout: 2_000 })
    .catch(() => {})
  const focus = await search.evaluate((element) => ({
    onSearch: document.activeElement === element,
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute('aria-label') ?? null,
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
    inputFocusedClass: Boolean(element.closest('.n-input--focus')),
  }))
  await record({ phase: 'after-confirmation', ...focus })
  await page.screenshot({
    path: path.join(root, 'workspace-removal-after.png'),
    animations: 'disabled',
  })
  const placeholder = home.locator('.toolbar-field--search .n-input__placeholder > span')
  await expect(placeholder).toBeVisible()
  const sample = await placeholder.evaluate(visibleTextColors)
  const searchContrast = { ...sample, ratio: contrastRatio(sample) }
  await record({ phase: 'search-placeholder-contrast', ...searchContrast })
  return { ariaModal, escapeFocus, focus, colors, searchContrast }
}

export async function runPackagedWorkspaceTrashRestore({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
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
    scenario: 'workspace-trash-restore',
    suite: 'packaged-workspace-trash-restore',
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })

  const original = path.join(root, 'Original Collection')
  const wrong = path.join(root, 'Different Collection')
  const scratch = path.join(root, 'project-fixture-scratch')
  const renamedRegistration = 'Restored Collection'
  for (const directory of [original, wrong, scratch]) {
    await mkdir(directory, { mode: 0o700 })
    assert.equal(await realpath(directory), directory)
  }
  const database = path.join(appData, 'database/app.sqlite')
  const targetPath = path.join(original, 'Harbor.igs')
  const neighborPath = path.join(original, 'Dune.igs')
  const target = {
    ...(await projectFile(targetPath, 'Harbor sketch', scratch)),
    file: await fileWitness(targetPath, identity),
  }
  const neighbor = {
    ...(await projectFile(neighborPath, 'Dune study', scratch)),
    file: await fileWitness(neighborPath, identity),
  }
  const copyPath = path.join(wrong, path.basename(targetPath))
  await copyFile(targetPath, copyPath, constants.COPYFILE_EXCL)
  const duplicate = {
    ...target,
    id: 'project-v1-' + createHash('sha256').update(copyPath).digest('hex'),
    file: await fileWitness(copyPath, identity),
  }
  assert.equal(duplicate.file.sha256, target.file.sha256)
  assert.notEqual(duplicate.file.inode, target.file.inode)
  async function assertSourceFiles() {
    for (const { file } of [target, neighbor, duplicate]) {
      assert.deepEqual(await fileWitness(file.path, identity), file)
    }
  }

  const chooser = []
  const first = await launch('workspace-unregistered')
  await expect(workspaceRow(first, 'Uncategorized 0')).toBeVisible()
  const initial = snapshot(database)
  assert.equal(initial.workspaces.length, 1)
  assert.equal(initial.workspaces[0].id, 'uncategorized')
  assert.deepEqual(initial.catalog, { accepted: [], jobs: 0, projects: [], receipts: 0, seeds: 0 })
  assert.deepEqual(initial.bindings, [])
  chooser.push(await addWorkspaceFolder(first, displayName, original))
  await assertView(first, [target, neighbor], original)
  const registered = snapshot(database)
  const workspace = registered.workspaces.find(({ directory }) => directory === original)
  assert.match(workspace.id, /^[0-9a-f-]{36}$/)
  expectCatalog(registered, workspace, [target, neighbor], appData)

  await homeOf(first)
    .getByRole('button', { exact: true, name: `${target.title} project actions` })
    .click()
  await first.page
    .locator('.n-dropdown-option-body__label')
    .filter({ hasText: /^Move to Trash$/ })
    .click()
  const trashDialog = first.page.getByRole('dialog', { exact: true, name: 'Move Project to Trash' })
  await trashDialog.getByRole('button', { exact: true, name: 'Move to Trash' }).click()
  await expect(trashDialog).toBeHidden()
  await assertView(first, [neighbor], original)
  const firstTrash = await showWorkspaceTrash(first)
  const row = firstTrash.locator(`[data-project-id="${target.id}"]`)
  await expect(row).toHaveCount(1)
  const lifecycle = trashLifecycle(database)
  assert.deepEqual(lifecycle.retired, [])
  assert.equal(lifecycle.trash.length, 1)
  const [trashed] = lifecycle.trash
  const trashId = trashed.trash_id
  assert.match(trashId, /^[0-9a-f-]{36}$/)
  await expect(row).toHaveAttribute('data-trash-id', trashId)
  assert.equal(trashed.state, 'trashed')
  assert.equal(trashed.local_project_key, target.id)
  assert.equal(trashed.canonical_path, targetPath)
  assert.equal(trashed.workspace_directory_path, original)
  assert.equal(trashed.workspace_name, displayName)
  assert.equal(trashed.file_missing, 0)
  assert.equal(trashed.delete_operation_id, null)

  const keyboard = await removeFixtureWorkspace(
    first,
    root,
    process.env.IMAGEGEN_WORKSPACE_TRASH_KEYBOARD === '1',
  )
  await expect(workspaceRow(first, `${displayName} 1`)).toHaveCount(0)
  await expect(
    (await showWorkspaceTrash(first)).locator(`[data-project-id="${target.id}"]`),
  ).toHaveAttribute('data-trash-id', trashId)
  assert.deepEqual(trashLifecycle(database), lifecycle)
  await assertSourceFiles()
  await closeNormally(first)
  const unregisteredIndex = await retainIndex(root, database, 'workspace-unregistered', identity)
  assert.deepEqual(
    {
      catalog: unregisteredIndex.catalog,
      workspaces: unregisteredIndex.workspaces,
      bindings: unregisteredIndex.bindings,
    },
    initial,
  )
  assert.deepEqual(trashLifecycle(unregisteredIndex.bytes.path), lifecycle)

  const second = await launch('trash-restored')
  const refusalMessage =
    'The original workspace is no longer registered. Add that exact folder again before restoring this Project.'
  async function assertRestoreRefusal() {
    const home = await showWorkspaceTrash(second)
    await expect(home.locator(`[data-project-id="${target.id}"]`)).toHaveAttribute(
      'data-trash-id',
      trashId,
    )
    assert.deepEqual(trashLifecycle(database), lifecycle)
    const before = snapshot(database)
    await home.getByRole('button', { exact: true, name: `Restore ${target.title}` }).click()
    await expect(home.getByText('Project action failed', { exact: true })).toBeVisible()
    await expect(home.getByText(refusalMessage, { exact: true })).toBeVisible()
    const response = await second.page.evaluate(
      ({ id, trashId }) => window.api.projects.restoreProject(id, trashId),
      { id: target.id, trashId },
    )
    assert.deepEqual(response, {
      ok: false,
      error: { code: 'PROJECT_NOT_FOUND', message: refusalMessage },
    })
    assert.deepEqual(snapshot(database), before)
    assert.deepEqual(trashLifecycle(database), lifecycle)
    await assertSourceFiles()
    return response.error
  }

  const afterRestart = await assertRestoreRefusal()
  assert.deepEqual(snapshot(database), initial)
  await second.page.screenshot({ path: path.join(root, 'restore-unregistered-refusal.png') })
  chooser.push(await addWorkspaceFolder(second, displayName, wrong))
  await homeOf(second).getByRole('button', { exact: true, name: 'Grid view' }).click()
  await assertView(second, [duplicate], wrong)
  const wrongIndex = snapshot(database)
  const wrongWorkspace = wrongIndex.workspaces.find(({ directory }) => directory === wrong)
  assert.notEqual(wrongWorkspace.id, workspace.id)
  expectCatalog(wrongIndex, wrongWorkspace, [duplicate], appData)
  const afterWrongFolder = await assertRestoreRefusal()

  chooser.push(await addWorkspaceFolder(second, renamedRegistration, original))
  const readdedNav = workspaceRow(second, `${renamedRegistration} 1`)
  await expect(readdedNav).toHaveAttribute('title', original)
  await expect(readdedNav).toHaveAttribute('aria-pressed', 'true')
  const readded = snapshot(database)
  const originalAgain = readded.workspaces.find(({ directory }) => directory === original)
  assert.match(originalAgain.id, /^[0-9a-f-]{36}$/)
  assert.notEqual(originalAgain.id, workspace.id)
  assert.equal(originalAgain.displayName, renamedRegistration)
  const expectedProjects = (originalProjects) =>
    [
      ...expectedCatalog(originalAgain, originalProjects).projects,
      ...expectedCatalog(wrongWorkspace, [duplicate]).projects,
    ].sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(readded.catalog, {
    ...initial.catalog,
    projects: expectedProjects([neighbor]),
  })
  assert.deepEqual(trashLifecycle(database), lifecycle)
  const readyTrash = await showWorkspaceTrash(second)
  await readyTrash.getByRole('button', { exact: true, name: `Restore ${target.title}` }).click()
  await expect(readyTrash.getByText('Trash is empty', { exact: true })).toBeVisible()
  await expect(workspaceRow(second, `${renamedRegistration} 2`)).toBeVisible()
  await expect(readyTrash.getByText('Project action failed', { exact: true })).toHaveCount(0)
  assert.deepEqual(trashLifecycle(database), { trash: [], retired: [] })
  const restoredCatalog = { ...initial.catalog, projects: expectedProjects([target, neighbor]) }
  assert.deepEqual(snapshot(database), { ...readded, catalog: restoredCatalog })
  await workspaceRow(second, `${renamedRegistration} 2`).click()
  await openProject(second, target)
  const reopened = await second.page.evaluate((id) => window.api.projects.open(id), target.id)
  assert.equal(reopened.ok, true)
  assert.equal(reopened.value.kind, 'opened')
  assert.equal(reopened.value.tab.id, target.id)
  assert.equal(reopened.value.tab.documentId, target.documentId)
  assert.equal(reopened.value.tab.documentRevision, target.revision)
  await second.page.screenshot({ path: path.join(root, 'restored-original-project.png') })
  await closeNormally(second)
  const restoredIndex = await retainIndex(root, database, 'workspace-restored', identity)
  assert.deepEqual(restoredIndex.catalog, restoredCatalog)
  assert.deepEqual(restoredIndex.workspaces, readded.workspaces)
  assert.deepEqual(restoredIndex.bindings, [])
  assert.deepEqual(trashLifecycle(restoredIndex.bytes.path), { trash: [], retired: [] })
  await assertSourceFiles()
  const retained = []
  for (const { file } of [target, neighbor, duplicate]) {
    const destination = path.join(root, `workspace-retained-${retained.length}.igs`)
    await copyFile(file.path, destination, constants.COPYFILE_EXCL)
    const bytes = await identity(destination)
    assert.deepEqual(bytes, { path: destination, sha256: file.sha256, sizeBytes: file.sizeBytes })
    retained.push({ original: file, retained: bytes })
  }

  const result = {
    chooser,
    registration: { original: workspace, wrong: wrongWorkspace, restored: originalAgain },
    lifecycle,
    refusals: { afterRestart, afterWrongFolder },
    unregisteredIndex,
    restoredIndex,
    retained,
    ...(keyboard ? { keyboard } : {}),
  }
  await writeFile(
    path.join(root, 'workspace-trash-restore-proof.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  if (keyboard) {
    assert.deepEqual(
      {
        escapeReturnedFocus: keyboard.escapeFocus.returnedToTrigger,
        removalFocusedSearch: keyboard.focus.onSearch,
        focusVisible: keyboard.focus.focusVisible && keyboard.focus.inputFocusedClass,
        ariaModal: keyboard.ariaModal,
        dialogTextContrast: keyboard.colors.every(({ ratio }) => ratio >= 4.5),
        searchPlaceholderContrast: keyboard.searchContrast.ratio >= 4.5,
      },
      {
        escapeReturnedFocus: true,
        removalFocusedSearch: true,
        focusVisible: true,
        ariaModal: 'true',
        dialogTextContrast: true,
        searchPlaceholderContrast: true,
      },
    )
  }
  return result
}
