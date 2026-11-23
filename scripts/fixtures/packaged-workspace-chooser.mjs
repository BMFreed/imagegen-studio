/** Exercise the real KDE folder chooser and the packaged workspace owners. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import {
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
  await homeOf(first).getByRole('button', { exact: true, name: 'Add Workspace' }).click()
  await draft.fill(displayName)
  const add = { state: first, windowTitle: 'Add Workspace', trigger: submit }
  chooser.push(await driveKdeDirectoryChooser(add))
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
    color: 'teal',
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
  return result
}
