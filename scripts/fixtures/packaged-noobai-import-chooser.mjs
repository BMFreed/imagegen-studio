/** Native file chooser and explicit portable Project transfer on the stock AppImage. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const execute = promisify(execFile)
const kdeChooser = process.env.IMAGEGEN_CHOOSER_KWIN_PID !== undefined
const title = 'Packaged trained noobai-v'
const documentId = 'caa062a2-8d3b-457a-b9c1-a10afb3c2b6b'
const revision = 'faf3961f-c55e-4f96-9d0d-3003742f4825'
const layerId = '203e80b0-e601-4f20-820f-3b46dd9b672b'
const imageSha256 = '0af6831f8106daf74c9e6805f92224f89c8006d0c4623703a1e47515463f1ec8'
const originalBytes = {
  sizeBytes: 337829,
  sha256: '0c0c1301e8ffee7293bcd0fa35ecd8a625d555973e5255ac173bc6d007b5f4f1',
}
const checkpoint = {
  civitaiModelId: 1147756,
  civitaiVersionId: 2679856,
  civitaiFileId: 2566634,
  fileSha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
  localModelId: 'ac33445f-4ebc-494c-8d05-f5c91b04f09f',
  localVersionId: '01034e7d-04a7-4fe7-9500-360392f00778',
}

async function assertPrivateDisplay() {
  const { DISPLAY, IMAGEGEN_CHOOSER_X11_PID, XAUTHORITY } = process.env
  assert.match(DISPLAY ?? '', /^:[1-9]\d*$/)
  assert.match(IMAGEGEN_CHOOSER_X11_PID ?? '', /^[1-9]\d+$/)
  const authority = await lstat(XAUTHORITY)
  assert.ok(authority.isFile() && authority.uid === process.getuid())
  assert.equal(authority.mode & 0o077, 0)
  const runtime = path.join(path.dirname(XAUTHORITY), 'runtime')
  assert.equal(process.env.XDG_RUNTIME_DIR, runtime)
  assert.notEqual(process.env.IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR, runtime)
  const runtimeStatus = await lstat(runtime)
  assert.ok(runtimeStatus.isDirectory() && runtimeStatus.uid === process.getuid())
  assert.equal(runtimeStatus.mode & 0o777, 0o700)
  const server = `/proc/${IMAGEGEN_CHOOSER_X11_PID}`
  assert.equal((await lstat(server)).uid, process.getuid())
  assert.equal((await readFile(`${server}/comm`, 'utf8')).trim(), 'Xvfb')
  const args = (await readFile(`${server}/cmdline`, 'utf8')).split('\0')
  assert.ok(!args.includes('-ac'))
  assert.ok(args.includes('-auth'))
  assert.equal(args[args.indexOf('-auth') + 1], XAUTHORITY)
  assert.ok(args.includes('-nolisten'))
  assert.equal(args[args.indexOf('-nolisten') + 1], 'tcp')
  const sockets = await Promise.all(
    (await readdir(`${server}/fd`)).map((fd) => readlink(`${server}/fd/${fd}`)),
  )
  const endpoint = `/tmp/.X11-unix/X${DISPLAY.slice(1)}`
  const bindings = (await readFile(`${server}/net/unix`, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[3] === '00010000' && [endpoint, `@${endpoint}`].includes(fields[7]))
  assert.ok(bindings.length > 0)
  assert.ok(bindings.every((fields) => sockets.includes(`socket:[${fields[6]}]`)))
}

async function xdotool(...args) {
  const { stdout } = await execute('/usr/bin/xdotool', args, { timeout: 8000 })
  return stdout.trim()
}

async function portalPid() {
  const { stdout } = await execute(
    '/usr/bin/gdbus',
    [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.DBus',
      '--object-path',
      '/org/freedesktop/DBus',
      '--method',
      'org.freedesktop.DBus.GetConnectionUnixProcessID',
      'org.freedesktop.impl.portal.desktop.gtk',
    ],
    { timeout: 3000 },
  )
  const pid = /^\(uint32 ([1-9]\d+),\)$/.exec(stdout.trim())?.[1]
  assert.ok(pid, 'Observe an owned GTK desktop portal on the isolated session bus.')
  assert.equal(await realpath(`/proc/${pid}/exe`), '/usr/libexec/xdg-desktop-portal-gtk')
  assert.equal((await lstat(`/proc/${pid}`)).uid, process.getuid())
  const environment = (await readFile(`/proc/${pid}/environ`, 'utf8')).split('\0')
  for (const key of ['DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS']) {
    assert.ok(process.env[key] && environment.includes(`${key}=${process.env[key]}`), key)
  }
  return pid
}

async function chooserWindows(windowTitle) {
  try {
    return (await xdotool('search', '--onlyvisible', '--name', `^${windowTitle}$`)).split('\n')
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return []
    throw error
  }
}

export async function chooseProject({
  state,
  source,
  observations,
  windowTitle = 'Import Project',
  trigger = state.page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('button', { name: 'Import Project', exact: true }),
}) {
  assert.ok(windowTitle === 'Import Project' || windowTitle === 'Locate Project')
  if (kdeChooser) {
    const { driveKdeChooser } = await import('./packaged-kde-chooser.mjs')
    observations.push(await driveKdeChooser({ state, source, windowTitle, trigger }))
    return
  }
  const visibleWindows = () => chooserWindows(windowTitle)
  await assertPrivateDisplay()
  assert.deepEqual(await visibleWindows(), [])
  await trigger.click()
  let windows
  await expect
    .poll(
      async () => {
        windows = await visibleWindows()
        return windows.length
      },
      {
        message: `Observe a single real ${windowTitle} window on the private X11 display.`,
        timeout: 12_000,
      },
    )
    .toBe(1)
  const [window] = windows
  assert.match(window, /^\d+$/)
  const pid = await xdotool('getwindowpid', window)
  assert.equal(pid, await portalPid())
  const { stdout } = await execute('/usr/bin/xprop', ['-id', window, 'WM_TRANSIENT_FOR'], {
    timeout: 3000,
  })
  const parent = stdout.match(/window id # (0x[1-9a-f][0-9a-f]*)/i)?.[1]
  assert.ok(parent, stdout.trim())
  assert.equal(await xdotool('getwindowpid', parent), String(state.mainPid))
  await xdotool('windowfocus', '--sync', window)
  assert.equal(await xdotool('getwindowfocus'), window)
  if (source) {
    await xdotool('key', '--clearmodifiers', 'ctrl+l')
    await delay(200)
    assert.equal(await xdotool('getwindowfocus'), window)
    await xdotool('type', '--clearmodifiers', '--delay', '3', '--', source)
    await delay(200)
    assert.equal(await xdotool('getwindowfocus'), window)
    await xdotool('key', '--clearmodifiers', 'Return')
    await delay(300)
    if ((await visibleWindows()).includes(window) && (await xdotool('getwindowfocus')) === window) {
      await xdotool('key', '--clearmodifiers', 'Return')
    }
  } else {
    await xdotool('key', '--clearmodifiers', 'Escape')
  }
  await expect.poll(visibleWindows).toEqual([])
  observations.push({
    lifetime: state.name,
    window,
    parent,
    pid: Number(pid),
    action: source ? 'select' : 'dismiss',
    windowTitle,
    selectedPath: source ?? null,
  })
}

export async function regularFile(filename) {
  assert.equal(await realpath(filename), filename)
  const status = await lstat(filename)
  assert.ok(status.isFile() && status.uid === process.getuid() && status.nlink === 1)
  return status
}

export async function assertOriginalBytes(filename, identity) {
  await regularFile(filename)
  assert.deepEqual(await identity(filename), { path: filename, ...originalBytes })
}

export function indexSnapshot(filename) {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const projects = database
      .prepare(
        `SELECT local_project_key AS id, canonical_path AS filename, document_id AS documentId,
                document_revision AS revision, display_name AS title, file_health AS health,
                workspace_id AS workspace, preview_status AS preview,
                file_size_bytes AS bytes, diagnostic_code AS diagnostic, trashed_at AS trashedAt
         FROM project_index ORDER BY local_project_key`,
      )
      .all()
    const accepted = database
      .prepare(
        `SELECT local_project_key AS id, layer_id AS layerId, document_id AS documentId,
                document_revision AS revision, model_file_sha256 AS checkpoint,
                asset_sha256 AS image, actual_seed AS seed, output_height AS height,
                output_width AS width, asset_bytes AS assetBytes
         FROM project_accepted_result_index ORDER BY local_project_key, layer_id`,
      )
      .all()
    return {
      projects,
      accepted,
      jobs: database.prepare('SELECT count(*) AS n FROM generation_queue_item').get().n,
      receipts: database.prepare('SELECT count(*) AS n FROM generation_candidate_receipt').get().n,
      seeds: database.prepare('SELECT count(*) AS n FROM generation_seed_cursor').get().n,
    }
  } finally {
    database.close()
  }
}

function assertCheckpoint(model, predictionType) {
  assert.ok(model)
  for (const [key, value] of Object.entries({ ...checkpoint, predictionType })) {
    assert.equal(model[key], value, key)
  }
}

export async function assertOpened(state, id) {
  await expect(state.page.getByRole('tab', { name: title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // The visible tab must already exist before reading the open session through preload.
  const { opened, accepted } = await state.page.evaluate(
    async ({ id, documentId, layerId }) => ({
      accepted: await window.api.projects.getRasterPresetData(id, documentId, layerId),
      opened: await window.api.projects.open(id),
    }),
    { id, documentId, layerId },
  )
  assert.equal(opened.ok, true)
  assert.equal(opened.value.kind, 'opened')
  const { tab } = opened.value
  assert.equal(tab.id, id)
  assert.equal(tab.documentId, documentId)
  assert.equal(tab.documentRevision, revision)
  assert.equal(tab.dirty, false)
  assert.equal(tab.autosaveError, null)
  assert.equal(tab.storageWarning, undefined)
  assertCheckpoint(tab.generationDraft.model, 'epsilon')
  assert.equal(tab.layers.length, 1)
  assert.equal(tab.acceptedResults.length, 1)
  const [result] = tab.acceptedResults
  assert.equal(result.layerId, layerId)
  assert.equal(result.imageUrl, tab.layers[0].imageUrl)
  assert.equal(result.modelFileSha256, checkpoint.fileSha256)
  assert.equal(result.seed, 0)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.value.documentId, documentId)
  assert.equal(accepted.value.layerId, layerId)
  assertCheckpoint(accepted.value.generationConfiguration.model, 'v_prediction')
}

export async function assertOfflineProjectDesktop({
  scenario,
  suite,
  root,
  ownedRunRoot,
  packageBefore,
  expectedPackage,
}) {
  const run = path.dirname(root)
  assert.equal(path.dirname(run), path.join(ownedRunRoot, suite))
  assert.match(path.basename(run), /^\d{8}(?:-r[1-9]\d*)?$/)
  assert.equal(path.basename(root), scenario)
  const stock = {
    path: path.join(
      ownedRunRoot,
      'packaged-noobai-preview/20261120/package-work/live/output',
      'imagegen-studio-0.1.0-dev.1-x86_64.AppImage',
    ),
    sizeBytes: 147139886,
    sha256: '555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8',
  }
  assert.deepEqual(packageBefore, expectedPackage ?? stock)
  if (kdeChooser) {
    const { assertPrivateWayland } = await import('./packaged-kde-chooser.mjs')
    await assertPrivateWayland()
  } else {
    await assertPrivateDisplay()
  }
}

export async function verifyChooserFixture({
  scenario,
  root,
  ownedRunRoot,
  packageBefore,
  identity,
  expectedPackage,
}) {
  const suite =
    {
      locate: 'packaged-noobai-locate',
      trash: 'packaged-project-trash',
      'home-recovery-keyboard': 'packaged-home-recovery-keyboard',
      'queue-startup-recovery': 'packaged-queue-startup-recovery',
    }[scenario] ?? 'packaged-noobai-chooser'
  await assertOfflineProjectDesktop({
    scenario,
    suite,
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage,
  })
  const original = path.join(
    ownedRunRoot,
    'packaged-installed-engine/20261118/trained-noobai-v-r2/native/after-restarted-close.igs',
  )
  await assertOriginalBytes(original, identity)
  return { path: original, ...originalBytes }
}

export async function runPortableImport({
  choice,
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
  const original = await verifyChooserFixture({
    scenario: choice,
    root,
    ownedRunRoot,
    packageBefore,
    identity,
  })
  const external = path.join(root, 'external')
  await mkdir(external, { mode: 0o700 })
  const source = path.join(external, 'Portable NoobAI.igs')
  await copyFile(original.path, source, constants.COPYFILE_EXCL)
  const sourceBefore = await regularFile(source)
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const destination = path.join(workspace, path.basename(source))
  const database = path.join(appData, 'database/app.sqlite')
  const empty = { projects: [], accepted: [], jobs: 0, receipts: 0, seeds: 0 }
  const chooser = []
  const first = await launch('external-import')
  const { page } = first
  const dialog = page.getByRole('dialog', { name: 'Import Project', exact: true })
  const assertUnchanged = async () => {
    assert.deepEqual((await readPorts(first)).projects.value, [])
    assert.deepEqual(indexSnapshot(database), empty)
    assert.deepEqual(await readdir(workspace), [])
    await assertOriginalBytes(source, identity)
    assert.equal((await regularFile(source)).ino, sourceBefore.ino)
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
  }
  await assertUnchanged()
  await chooseProject({ state: first, observations: chooser })
  await expect(page.getByRole('button', { name: 'Import Project', exact: true })).toBeEnabled()
  await assertUnchanged()
  await chooseProject({ state: first, source, observations: chooser })
  await expect(dialog).toContainText(path.basename(source))
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await assertUnchanged()
  await chooseProject({ state: first, source, observations: chooser })
  await expect(dialog).toContainText(title)
  if (choice === 'copy') {
    await dialog.getByText('Keep the original and copy it here', { exact: true }).click()
  }
  const confirm = choice === 'copy' ? 'Copy and Open' : 'Move and Open'
  await dialog.getByRole('button', { name: confirm, exact: true }).click()
  await expect(dialog).toBeHidden()
  const snapshot = indexSnapshot(database)
  assert.equal(snapshot.projects.length, 1)
  const [{ id }] = snapshot.projects
  assert.equal(id, `project-v1-${createHash('sha256').update(destination).digest('hex')}`)
  assert.deepEqual(snapshot, {
    ...empty,
    projects: [
      {
        id,
        filename: destination,
        documentId,
        revision,
        title,
        health: 'ready',
        workspace: 'uncategorized',
        preview: 'rendered',
        bytes: originalBytes.sizeBytes,
        diagnostic: null,
        trashedAt: null,
      },
    ],
    accepted: [
      {
        id,
        layerId,
        documentId,
        revision,
        checkpoint: checkpoint.fileSha256,
        image: imageSha256,
        seed: 0,
        height: 256,
        width: 256,
        assetBytes: 112651,
      },
    ],
  })
  const assertTransferred = async () => {
    await assertOriginalBytes(original.path, identity)
    await assertOriginalBytes(destination, identity)
    if (choice === 'copy') {
      await assertOriginalBytes(source, identity)
      assert.equal((await regularFile(source)).ino, sourceBefore.ino)
      assert.notEqual((await regularFile(destination)).ino, sourceBefore.ino)
    } else {
      await assert.rejects(lstat(source), { code: 'ENOENT' })
    }
    assert.deepEqual(await readdir(external), choice === 'copy' ? [path.basename(source)] : [])
    assert.deepEqual(await readdir(workspace), [path.basename(destination)])
    assert.deepEqual(indexSnapshot(database), snapshot)
  }
  await assertOpened(first, id)
  await assertTransferred()
  await closeNormally(first)
  const saved = await retainOwnStore('after-import')

  const second = await launch('managed-reopen')
  assert.equal((await readPorts(second)).projects.value.length, 1)
  await expect(second.page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
  await chooseProject({ state: second, source: destination, observations: chooser })
  await assertOpened(second, id)
  await expect(
    second.page.getByRole('dialog', { name: 'Import Project', exact: true }),
  ).toBeHidden()
  await assertTransferred()
  await closeNormally(second)
  const restarted = await retainOwnStore('after-managed-reopen')
  await assertTransferred()
  return {
    saved,
    restarted,
    portableNoobaiImport: {
      choice,
      chooser,
      original,
      transfer: snapshot,
      externalSourceRetained: choice === 'copy',
      draftPredictionType: 'epsilon',
      acceptedPredictionType: 'v_prediction',
      runtime: 'not-installed',
    },
  }
}
