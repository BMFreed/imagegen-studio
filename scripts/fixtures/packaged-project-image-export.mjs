/** Stock File actions, installed CPU worker and independently verified PNG publication. */
import { expect } from '@playwright/test'
import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { driveKdeSaveChooser } from './packaged-kde-chooser.mjs'

const execute = promisify(execFile)
const sourceBytes = {
  sizeBytes: 107262,
  sha256: '049c61378499e8b1221fcea9a690a8276cc23e399c7730ffa6546688d0715b39',
}
const title = 'Owned image export source'
const documentId = '33b282fa-4c70-4577-a851-50b083d271cf'
const revision = 'b4330ec2-5276-47c7-a3b5-4758da6e9e5a'
const primaryBbox = { x: -20, y: 30, width: 64, height: 64 }
const smartBbox = { x: 500, y: -500, width: 256, height: 128 }
const smartLayerName = 'Export Smart owner'
const smartLayerId = 'ebec8148-ab19-462d-9ccd-331aed2c8cb1'
const activeVariantId = 'b291f539-810d-4e0a-a124-dd0638f6988a'
const windowTitles = { canvas: 'Export As', bbox: 'Export Generation BBox' }
const outputSizes = { canvas: [2075, 36], bbox: [64, 64] }
const bboxName = 'primary generation box.png'
const collisionDiagnostic = 'A file with that name already exists. Choose a different filename.'
const pngOracle = fileURLToPath(
  new URL('./packaged-project-image-export-oracle.py', import.meta.url),
)

async function assertOwnedFile(filename) {
  assert.equal(await realpath(filename), filename)
  const stat = await lstat(filename)
  assert.ok(stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1)
  return { dev: stat.dev, ino: stat.ino }
}

async function existingPngWitness(filename, identity) {
  assert.equal(await realpath(filename), filename)
  const fileIdentity = async () => {
    const info = await lstat(filename, { bigint: true })
    assert.ok(info.isFile() && info.uid === BigInt(process.getuid()) && info.nlink === 1n)
    return {
      dev: String(info.dev),
      ino: String(info.ino),
      mode: String(info.mode),
      mtimeNs: String(info.mtimeNs),
      ctimeNs: String(info.ctimeNs),
    }
  }
  const before = await fileIdentity()
  const bytes = await identity(filename)
  assert.deepEqual(await fileIdentity(), before)
  return { ...bytes, ...before }
}

async function stageProject({ root, appData, ownedRunRoot, packageBefore, identity }) {
  const engineRun = path.join(ownedRunRoot, 'packaged-installed-engine/20261118')
  const run = path.dirname(root)
  assert.equal(path.dirname(run), engineRun)
  assert.match(path.basename(run), /^project-export-r[1-9]\d*$/)
  assert.equal(path.basename(root), 'native')
  assert.ok(appData.startsWith(`${engineRun}/payloads/`))
  assert.equal(await realpath(appData), appData)
  // The installed-engine wrapper writes this only after checking current sources,
  // the stock-package manifest and all dist bytes against the sealed proof.
  const receipt = path.join(run, 'engine-inputs.json')
  await assertOwnedFile(receipt)
  const { appImage, appImageSha256, packageProof } = JSON.parse(await readFile(receipt, 'utf8'))
  assert.equal(appImage, packageBefore.path)
  assert.equal(appImageSha256, packageBefore.sha256)
  assert.deepEqual(packageProof?.appImage, packageBefore)
  const original = path.join(
    ownedRunRoot,
    'packaged-project-image-export-inputs/20261121/export-source.igs',
  )
  const originalInode = await assertOwnedFile(original)
  assert.deepEqual(await identity(original), { path: original, ...sourceBytes })
  await assert.rejects(lstat(path.join(appData, 'database/app.sqlite')), { code: 'ENOENT' })
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { mode: 0o700, recursive: true })
  assert.equal(await realpath(workspace), workspace)
  assert.deepEqual(await readdir(workspace), [])
  const filename = path.join(workspace, `${title}.igs`)
  await copyFile(original, filename, constants.COPYFILE_EXCL)
  const inode = await assertOwnedFile(filename)
  assert.notDeepEqual(inode, originalInode)
  assert.deepEqual(await identity(filename), { path: filename, ...sourceBytes })
  const localKey = `project-v1-${createHash('sha256').update(filename).digest('hex')}`
  return { filename, inode, localKey, original, originalInode }
}

function databaseSnapshot(filename) {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const tables = [
      'project_index',
      'project_accepted_result_index',
      'project_file_lifecycle',
      'generation_queue_item',
      'generation_candidate_receipt',
      'generation_seed_cursor',
      'presets',
      'model_resource_version',
    ]
    return Object.fromEntries(
      tables.map((table) => [
        table,
        database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    )
  } finally {
    database.close()
  }
}

async function readTab(page, localKey) {
  const opened = await page.evaluate((id) => window.api.projects.open(id), localKey)
  assert.equal(opened.ok, true, JSON.stringify(opened))
  assert.equal(opened.value.kind, 'opened')
  const { tab } = opened.value
  assert.equal(tab.id, localKey)
  assert.equal(tab.documentId, documentId)
  assert.equal(tab.documentRevision, revision)
  assert.deepEqual(tab.primaryBbox, primaryBbox)
  assert.deepEqual([tab.dirty, tab.canUndo, tab.canRedo], [false, false, false])
  assert.equal(tab.layers.length, 5)
  const smart = tab.layers.find(({ id }) => id === smartLayerId)
  assert.deepEqual(smart.boundingBox, smartBbox)
  assert.equal(smart.activeRasterSubLayerId, activeVariantId)
  return tab
}

async function openProject(state, readPorts, localKey) {
  const ports = await readPorts(state)
  assert.deepEqual(
    ports.projects.value.map(({ id }) => id),
    [localKey],
  )
  assert.deepEqual(ports.catalog.value, [])
  assert.equal(ports.runtime.value.kind, 'ready')
  const { page } = state
  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('button', { name: `Open ${title}`, exact: true })
    .click()
  const project = page.getByLabel(`Project ${title}`, { exact: true })
  await expect(project.locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  const selectSmart = project.getByRole('button', { name: `Select ${smartLayerName}`, exact: true })
  await selectSmart.click()
  await expect(selectSmart).toHaveAttribute('aria-pressed', 'true')
  return await readTab(page, localKey)
}

async function readProcIdentity(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    const fields = stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/)
    assert.match(fields[19], /^\d+$/)
    return { pid, parent: Number(fields[1]), start: fields[19] }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error
    return null
  }
}

async function workerChildren(mainPid, pythonExecutable) {
  const taskDirectory = `/proc/${mainPid}/task`
  const children = new Set()
  for (const task of await readdir(taskDirectory)) {
    try {
      const pids = (await readFile(`${taskDirectory}/${task}/children`, 'utf8')).match(/\d+/g)
      for (const pid of pids ?? []) children.add(Number(pid))
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error
    }
  }
  const candidates = []
  for (const pid of children) {
    try {
      const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
      if (args[0] === pythonExecutable && args.slice(1).join(' ') === '-I -m imagegen_worker') {
        candidates.push(pid)
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error
    }
  }
  assert.equal(candidates.length, 1, 'The held export must own exactly one installed CPU child.')
  const [pid] = candidates
  const processIdentity = await readProcIdentity(pid)
  assert.ok(processIdentity && processIdentity.parent === mainPid)
  const proc = `/proc/${pid}`
  const executable = await realpath(pythonExecutable)
  assert.equal(await realpath(`${proc}/exe`), executable)
  assert.equal((await lstat(proc)).uid, process.getuid())
  const environment = (await readFile(`${proc}/environ`, 'utf8')).split('\0')
  assert.ok(environment.includes('CUDA_VISIBLE_DEVICES='))
  const cgroup = await readFile(`${proc}/cgroup`, 'utf8')
  assert.equal(cgroup, await readFile(`/proc/${mainPid}/cgroup`, 'utf8'))
  assert.deepEqual(await readProcIdentity(pid), processIdentity)
  return {
    ...processIdentity,
    executable,
    pythonExecutable,
    cgroup: cgroup.trim(),
    cudaVisibleDevices: '',
  }
}

const stagingNames = async (scratch) =>
  (await readdir(scratch)).filter((name) => name.startsWith('project-export-'))

async function inspectHeldExport({ state, pythonExecutable, appData, scratch, identity, region }) {
  const [stage, ...others] = await stagingNames(scratch)
  assert.ok(stage && others.length === 0)
  const directory = path.join(scratch, stage)
  assert.equal(await realpath(directory), directory)
  const worker = await workerChildren(state.mainPid, pythonExecutable)
  assert.equal(await realpath(`/proc/${worker.pid}/cwd`), path.join(appData, 'runtime'))
  const output = path.join(directory, 'export.png')
  await assertOwnedFile(output)
  const png = await identity(output)
  const { stdout } = await execute('/usr/bin/python3', ['-I', pngOracle, output, region], {
    timeout: 10000,
    maxBuffer: 16384,
  })
  const decoded = JSON.parse(stdout)
  assert.deepEqual([decoded.width, decoded.height], outputSizes[region])
  return { worker, staged: png, decoded }
}

export async function runPackagedProjectImageExport({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  pythonExecutable,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  assert.ok(pythonExecutable.startsWith(path.join(appData, 'runtime/environments') + '/'))
  const project = await stageProject({ root, appData, ownedRunRoot, packageBefore, identity })
  const database = path.join(appData, 'database/app.sqlite')
  const scratch = path.join(appData, 'scratch')
  const destinations = path.join(root, 'exports')
  await mkdir(destinations, { mode: 0o700 })
  const observations = []

  async function exportImage(state, region, outputName, existingPng) {
    assert.deepEqual(await stagingNames(scratch), [])
    const { page } = state
    const destination = outputName ? path.join(destinations, outputName) : null
    const windowTitle = windowTitles[region]
    await page.getByRole('button', { name: 'File menu', exact: true }).click()
    const trigger = page
      .locator('.n-dropdown-option-body')
      .filter({ has: page.getByText(`${windowTitle}…`, { exact: true }) })
    let held = null
    const chooser = await driveKdeSaveChooser({
      state,
      destination,
      trigger,
      windowTitle,
      confirmExistingPng: existingPng !== undefined,
      onPresented: async () => {
        assert.equal(held, null)
        held = await inspectHeldExport({
          state,
          pythonExecutable,
          appData,
          scratch,
          identity,
          region,
        })
      },
    })
    assert.ok(held, 'The installed export worker and staged PNG must be observed during Save.')
    await expect
      .poll(async () => (await readProcIdentity(held.worker.pid))?.start !== held.worker.start)
      .toBe(true)
    await expect.poll(() => stagingNames(scratch)).toEqual([])
    let published = null
    let collision = null
    if (existingPng) {
      assert.equal(destination, existingPng.path)
      assert.notEqual(held.staged.sha256, existingPng.sha256)
      await expect(page.getByText(collisionDiagnostic, { exact: true })).toBeVisible()
      const destinationAfter = await existingPngWitness(destination, identity)
      assert.deepEqual(destinationAfter, existingPng)
      assert.deepEqual((await readdir(destinations)).sort(), [bboxName, 'visible canvas.png'])
      collision = {
        destinationBefore: existingPng,
        destinationAfter,
        rendererDiagnostic: collisionDiagnostic,
      }
    } else if (destination) {
      const [width, height] = outputSizes[region]
      await expect(
        page.getByText(`Exported ${outputName} (${width} × ${height}).`, { exact: true }),
      ).toBeVisible()
      await assertOwnedFile(destination)
      published = await identity(destination)
      assert.deepEqual(published, { ...held.staged, path: destination })
    } else {
      assert.deepEqual(await readdir(destinations), [])
    }
    observations.push({
      lifetime: state.name,
      region,
      chooser,
      ...held,
      published,
      workerExited: true,
      ...(collision && { collision }),
    })
    return published
  }

  async function unchanged(state, tab, rows) {
    assert.deepEqual(await readTab(state.page, project.localKey), tab)
    assert.deepEqual(databaseSnapshot(database), rows)
    assert.deepEqual(await assertOwnedFile(project.filename), project.inode)
    assert.deepEqual(await assertOwnedFile(project.original), project.originalInode)
    assert.deepEqual(await identity(project.filename), { path: project.filename, ...sourceBytes })
    assert.deepEqual(await identity(project.original), { path: project.original, ...sourceBytes })
  }

  const first = await launch('first')
  const tab = await openProject(first, readPorts, project.localKey)
  const rows = databaseSnapshot(database)
  assert.equal(rows.project_index.length, 1)
  assert.equal(rows.project_index[0].local_project_key, project.localKey)
  assert.deepEqual(
    [rows.generation_queue_item, rows.generation_candidate_receipt, rows.generation_seed_cursor],
    [[], [], []],
  )
  await exportImage(first, 'canvas', null)
  await unchanged(first, tab, rows)
  const canvas = await exportImage(first, 'canvas', 'visible canvas.png')
  await unchanged(first, tab, rows)
  const bbox = await exportImage(first, 'bbox', bboxName)
  await unchanged(first, tab, rows)
  const existingPng = await existingPngWitness(bbox.path, identity)
  assert.equal(existingPng.sha256, bbox.sha256)
  assert.equal(existingPng.sizeBytes, bbox.sizeBytes)
  await exportImage(first, 'canvas', bboxName, existingPng)
  await unchanged(first, tab, rows)
  await closeNormally(first)
  const saved = await retainOwnStore('after-export')

  const second = await launch('restarted')
  const reopened = await openProject(second, readPorts, project.localKey)
  const reopenedRows = databaseSnapshot(database)
  for (const [table, before] of Object.entries(rows)) {
    if (table !== 'project_index') assert.deepEqual(reopenedRows[table], before)
  }
  const repeated = await exportImage(second, 'canvas', 'reopened canvas.png')
  assert.deepEqual(repeated, { ...canvas, path: repeated.path })
  await unchanged(second, reopened, reopenedRows)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-export-restart')
  assert.deepEqual(saved.project, restarted.project)
  assert.deepEqual(await existingPngWitness(bbox.path, identity), existingPng)
  assert.deepEqual((await readdir(destinations)).sort(), [
    bboxName,
    'reopened canvas.png',
    'visible canvas.png',
  ])
  return {
    saved,
    restarted,
    packagedProjectImageExport: {
      project: {
        source: await identity(project.original),
        localKey: project.localKey,
        documentId,
        revision,
        primaryBbox,
        smartBbox,
        activeVariantId,
      },
      observations,
      normalPhysicalExits: 2,
    },
  }
}
