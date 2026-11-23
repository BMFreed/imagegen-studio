/** Closed, restored and deleted Project states through the stock AppImage Home UI. */
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
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import {
  assertOpened,
  assertOriginalBytes,
  indexSnapshot,
  regularFile,
  verifyChooserFixture,
} from './packaged-noobai-import-chooser.mjs'

const targetTitle = 'Packaged trained noobai-v'
const targetBasename = 'Trash trajectory.igs'
const neighborTitle = 'Unrelated Project'
const sentinelName = 'Keep this file.txt'
const sentinelText = 'A neighboring non-Project file must survive.\n'
const home = (page) => page.getByLabel('Workspace navigation', { exact: true })
const tab = (page, title) => page.getByRole('tab', { name: title, exact: true })
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true })
const button = (scope, name) => scope.getByRole('button', { name, exact: true })

function lifecycleSnapshot(filename) {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    return {
      trash: database
        .prepare(
          `SELECT local_project_key AS id, canonical_path AS filename,
                  workspace_directory_path AS workspace, trash_id AS trashId,
                  trashed_at AS trashedAt, state, delete_operation_id AS deleteOperation,
                  delete_committed_at AS deleteCommit, file_missing AS missing
           FROM project_file_lifecycle ORDER BY local_project_key`,
        )
        .all(),
      retired: database
        .prepare('SELECT local_project_key AS id FROM project_identity_retired_key ORDER BY id')
        .all()
        .map(({ id }) => id),
    }
  } finally {
    database.close()
  }
}

function projectPort(page, method, ...args) {
  return page.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args })
}

async function listTrash(page) {
  const result = await projectPort(page, 'listTrash')
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

async function assertRefusal(page, code, method, ...args) {
  const result = await projectPort(page, method, ...args)
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.error.code, code)
  return result.error
}

async function closeProject(page, title) {
  const projectTab = page.locator(`[role="tab"][aria-label="${title}"]`)
  await button(projectTab, `Close ${title}`).click()
  await expect(projectTab).toHaveCount(0)
  await showHome(page)
}

async function showHome(page) {
  if ((await tab(page, 'Home').count()) === 0)
    await page.getByLabel('Open Home', { exact: true }).click()
  await tab(page, 'Home').click()
  await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeVisible()
}

async function requestTrash(page) {
  const modal = dialog(page, 'Move Project to Trash')
  await showHome(page)
  await button(page, `${targetTitle} project actions`).click()
  await page
    .locator('.n-dropdown-option-body__label')
    .filter({ hasText: /^Move to Trash$/ })
    .click()
  await expect(modal).toBeVisible()
  return modal
}

async function moveToTrash(page) {
  const modal = await requestTrash(page)
  await button(modal, 'Move to Trash').click()
  await expect(modal).toBeHidden()
}

async function showTrash(page) {
  await showHome(page)
  await home(page)
    .getByRole('button', { name: /^Trash(?:\s+\d+)?$/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
}

async function createNeighbor(page) {
  const modal = dialog(page, 'New Project')
  await button(home(page), 'New Project').click()
  await modal.getByRole('textbox', { name: 'Project name', exact: true }).fill(neighborTitle)
  await button(modal, 'Create Project').click()
  await expect(modal).toBeHidden()
  await expect(tab(page, neighborTitle)).toHaveAttribute('aria-selected', 'true')
  await closeProject(page, neighborTitle)
}

async function connectTrashKeyboard(state, root) {
  const { connectNativeInput } = await import('./packaged-home-recovery-keyboard.mjs')
  const page = state.page
  const trace = path.join(root, 'native-keyboard.ndjson')
  const observations = []
  const record = (entry) => appendFile(trace, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
  const input = await connectNativeInput(state, record, root)
  await input.resize(900, 620)

  return {
    input,
    observations,
    trace,
    async tabTo(target, phase) {
      await expect(target).toBeVisible()
      await expect(target).toBeEnabled()
      for (let count = 0; count < 64; count++) {
        if (await target.evaluate((element) => element === document.activeElement)) return
        await input.press('Tab', phase)
      }
      await expect(target, phase).toBeFocused({ timeout: 1_000 })
    },
    async observe(phase, target) {
      const inspect = (expected) => {
        const active = document.activeElement
        const style = active && getComputedStyle(active)
        return {
          returnedToTrigger: expected ? active === expected : null,
          active: active && {
            tag: active.tagName,
            name: active.getAttribute('aria-label') ?? active.textContent?.trim().slice(0, 90),
            role: active.getAttribute('role'),
            dialog: active.closest('[role=dialog]')?.getAttribute('aria-label') ?? null,
            focusVisible: active.matches(':focus-visible'),
            outline: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
          },
        }
      }
      if (target) {
        await expect(target)
          .toBeFocused({ timeout: 2_000 })
          .catch(() => undefined)
      }
      const focus = target ? await target.evaluate(inspect) : await page.evaluate(inspect, null)
      const screenshot = path.join(root, `${phase}-900x620.png`)
      const observed = { phase, ...focus, screenshot }
      observations.push(observed)
      await record(observed)
      await page.screenshot({ path: screenshot, animations: 'disabled' })
      return observed
    },
  }
}

export async function runPackagedProjectTrash({
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
  const nativeWayland = process.env.IMAGEGEN_CHOOSER_KWIN_PID !== undefined
  let expectedPackage
  if (nativeWayland) {
    const proof = JSON.parse(
      await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
    )
    assert.equal(proof.schemaVersion, 1)
    assert.ok(proof.package.path.startsWith(`${ownedRunRoot}${path.sep}`))
    expectedPackage = proof.package
  }
  const original = await verifyChooserFixture({
    scenario: 'trash',
    root,
    ownedRunRoot,
    packageBefore,
    identity,
    expectedPackage,
  })
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const source = path.join(workspace, targetBasename)
  const database = path.join(appData, 'database/app.sqlite')
  const sentinel = path.join(workspace, sentinelName)
  const id = `project-v1-${createHash('sha256').update(source).digest('hex')}`
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  assert.deepEqual(await readdir(workspace), [])
  await copyFile(original.path, source, constants.COPYFILE_EXCL)
  await writeFile(sentinel, sentinelText, { flag: 'wx', mode: 0o600 })
  const sourceStat = await regularFile(source)

  const first = await launch('trash-owned-source')
  const firstPage = first.page
  assert.deepEqual(
    (await readPorts(first)).projects.value.map((row) => row.id),
    [id],
  )
  await button(firstPage, 'List view').click()
  await createNeighbor(firstPage)
  const baseline = indexSnapshot(database)
  assert.equal(baseline.projects.length, 2)
  const target = baseline.projects.find((entry) => entry.id === id)
  const neighbor = baseline.projects.find((entry) => entry.title === neighborTitle)
  assert.equal(target?.title, targetTitle)
  assert.equal(target.filename, source)
  assert.equal(target.workspace, 'uncategorized')
  assert.equal(target.trashedAt, null)
  assert.equal(neighbor?.workspace, 'uncategorized')
  assert.equal(path.dirname(neighbor.filename), workspace)
  assert.notEqual(neighbor.id, id)
  assert.notEqual(neighbor.documentId, target.documentId)
  assert.deepEqual(
    baseline.accepted.map((entry) => entry.id),
    [id],
  )
  assert.deepEqual([baseline.jobs, baseline.receipts, baseline.seeds], [0, 0, 0])
  const neighborBefore = await identity(neighbor.filename)
  const neighborStat = await regularFile(neighbor.filename)
  const expectedFinalIndex = { ...baseline, projects: [neighbor], accepted: [] }
  const emptyLifecycle = { trash: [], retired: [] }

  async function assertSource() {
    await assertOriginalBytes(original.path, identity)
    await assertOriginalBytes(source, identity)
    const current = await regularFile(source)
    assert.deepEqual([current.dev, current.ino], [sourceStat.dev, sourceStat.ino])
  }

  async function assertNeighbor() {
    assert.deepEqual(await identity(neighbor.filename), neighborBefore)
    const current = await regularFile(neighbor.filename)
    assert.deepEqual([current.dev, current.ino], [neighborStat.dev, neighborStat.ino])
    assert.equal(await readFile(sentinel, 'utf8'), sentinelText)
  }

  async function verifyTrashed(state, navigate = true) {
    assert.deepEqual(
      (await readPorts(state)).projects.value.map((row) => row.id),
      [neighbor.id],
    )
    const rows = await listTrash(state.page)
    assert.equal(rows.length, 1)
    const [summary] = rows
    assert.equal(summary.id, id)
    assert.equal(summary.title, targetTitle)
    assert.equal(summary.fileName, targetBasename)
    assert.equal(summary.workspaceId, target.workspace)
    assert.equal(summary.originalWorkspaceDirectoryPath, workspace)
    assert.equal(summary.deletionStatus, 'trashed')
    assert.match(summary.trashId, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/)
    if (navigate) await showTrash(state.page)
    await expect(state.page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
    await expect(state.page.locator(`[data-project-id="${id}"]`)).toHaveAttribute(
      'data-trash-id',
      summary.trashId,
    )
    assert.deepEqual(lifecycleSnapshot(database), {
      trash: [
        {
          id,
          filename: source,
          workspace,
          trashId: summary.trashId,
          trashedAt: summary.trashedAt,
          state: 'trashed',
          deleteOperation: null,
          deleteCommit: null,
          missing: 0,
        },
      ],
      retired: [],
    })
    assert.deepEqual(indexSnapshot(database), {
      ...baseline,
      projects: baseline.projects.map((row) =>
        row.id === id ? { ...row, trashedAt: summary.trashedAt } : row,
      ),
    })
    await assertSource()
    await assertNeighbor()
    return summary
  }

  await button(firstPage, `Open ${targetTitle}`).click()
  await assertOpened(first, id)
  const blocked = await requestTrash(firstPage)
  await expect(button(blocked, 'Move to Trash')).toHaveCount(0)
  const openRefusal = await assertRefusal(firstPage, 'PROJECT_ALREADY_OPEN', 'trashProject', id)
  await button(blocked, 'Switch to Project').click()
  await expect(blocked).toBeHidden()
  await expect(tab(firstPage, targetTitle)).toHaveAttribute('aria-selected', 'true')
  assert.deepEqual(await listTrash(firstPage), [])
  assert.deepEqual(lifecycleSnapshot(database), emptyLifecycle)
  assert.deepEqual(indexSnapshot(database), baseline)
  await assertSource()

  await closeProject(firstPage, targetTitle)
  await moveToTrash(firstPage)
  const firstTrash = await verifyTrashed(first)
  const trashedOpenRefusal = await assertRefusal(firstPage, 'PROJECT_TRASHED', 'open', id)
  await closeNormally(first)
  const saved = await retainOwnStore('after-trash', targetBasename)

  const second = await launch('restore-and-delete')
  const secondPage = second.page
  await button(secondPage, 'List view').click()
  const restartTrash = await verifyTrashed(second)
  assert.equal(restartTrash.trashId, firstTrash.trashId)
  assert.equal(restartTrash.trashedAt, firstTrash.trashedAt)
  const keyboard = nativeWayland ? await connectTrashKeyboard(second, root) : null
  const searchProjects = secondPage.getByRole('textbox', { name: 'Search projects', exact: true })
  const restore = button(secondPage, `Restore ${targetTitle}`)
  if (keyboard) {
    await keyboard.tabTo(restore, 'reach-restore')
    await keyboard.input.press('Return', 'restore-project')
  } else {
    await restore.click()
  }
  await expect(secondPage.getByText('Trash is empty', { exact: true })).toBeVisible()
  const afterRestore = await keyboard?.observe('after-restore', searchProjects)
  assert.deepEqual(await listTrash(secondPage), [])
  assert.deepEqual(lifecycleSnapshot(database), emptyLifecycle)
  assert.deepEqual(indexSnapshot(database), baseline)
  await assertSource()
  await button(home(secondPage), 'Projects').click()
  await button(secondPage, `Open ${targetTitle}`).click()
  await assertOpened(second, id)
  await closeProject(secondPage, targetTitle)

  await moveToTrash(secondPage)
  const secondTrash = await verifyTrashed(second)
  assert.notEqual(secondTrash.trashId, firstTrash.trashId)
  const stale = await assertRefusal(
    secondPage,
    'PROJECT_TRASH_CONFLICT',
    'deleteProjectPermanently',
    id,
    firstTrash.trashId,
    true,
  )
  const unconfirmed = await assertRefusal(
    secondPage,
    'IPC_INVALID_CALLER',
    'deleteProjectPermanently',
    id,
    secondTrash.trashId,
    false,
  )
  const remove = button(secondPage, `Delete ${targetTitle} permanently`)
  const confirmation = dialog(secondPage, 'Delete Project Permanently')
  const cancel = button(confirmation, 'Cancel')
  const confirm = button(confirmation, 'Delete Permanently')
  const dismissals = []
  const openings = []
  const trap = []
  if (keyboard) {
    for (const choice of ['escape', 'cancel']) {
      await keyboard.tabTo(remove, `reach-delete-for-${choice}`)
      await keyboard.input.press('Return', `open-delete-for-${choice}`)
      await expect(confirmation).toContainText(targetBasename)
      await expect(cancel).toBeEnabled()
      await expect(confirm).toBeEnabled()
      openings.push(await keyboard.observe(`delete-open-${choice}`))

      await keyboard.tabTo(cancel, `reach-cancel-for-${choice}`)
      for (const [key, expected, label] of [
        ['Tab', confirm, 'forward-to-delete'],
        ['Tab', cancel, 'forward-wrap-to-cancel'],
        ['shift+Tab', confirm, 'reverse-wrap-to-delete'],
        ['Tab', cancel, 'restore-cancel-focus'],
      ]) {
        await keyboard.input.press(key, `check-delete-trap-${choice}-${label}`)
        trap.push(await keyboard.observe(`delete-trap-${choice}-${label}`, expected))
      }

      if (choice === 'cancel') {
        await keyboard.tabTo(cancel, 'focus-cancel-before-enter')
        await expect(cancel).toBeFocused()
      }
      await keyboard.input.press(
        choice === 'escape' ? 'Escape' : 'Return',
        `dismiss-delete-${choice}`,
      )
      await expect(confirmation).toBeHidden()
      dismissals.push(await keyboard.observe(`after-delete-${choice}`, remove))
      assert.equal((await verifyTrashed(second, false)).trashId, secondTrash.trashId)
    }
  } else {
    await remove.click()
    await expect(confirmation).toContainText(targetBasename)
    await cancel.click()
    await expect(confirmation).toBeHidden()
    assert.equal((await verifyTrashed(second)).trashId, secondTrash.trashId)
  }

  async function assertDeleted(state) {
    assert.deepEqual(
      (await readPorts(state)).projects.value.map((row) => row.id),
      [neighbor.id],
    )
    assert.deepEqual(await listTrash(state.page), [])
    assert.deepEqual(lifecycleSnapshot(database), { trash: [], retired: [id] })
    assert.deepEqual(indexSnapshot(database), expectedFinalIndex)
    await assert.rejects(lstat(source), { code: 'ENOENT' })
    assert.deepEqual(
      (await readdir(workspace)).sort(),
      [path.basename(neighbor.filename), sentinelName].sort(),
    )
    await assertNeighbor()
    await assertOriginalBytes(original.path, identity)
  }

  if (keyboard) {
    await keyboard.tabTo(remove, 'reach-delete-for-confirmation')
    await keyboard.input.press('Return', 'open-delete-for-confirmation')
    await expect(confirmation).toContainText(targetBasename)
    await keyboard.tabTo(cancel, 'reach-cancel-before-deliberate-delete')
    await keyboard.input.press('Tab', 'deliberately-focus-delete')
    await expect(confirm).toBeFocused()
    await keyboard.observe('before-confirmed-delete', confirm)
    await keyboard.input.press('Return', 'confirm-permanent-delete')
  } else {
    await remove.click()
    await confirm.click()
  }
  await expect(confirmation).toBeHidden()
  await expect(secondPage.getByText('Trash is empty', { exact: true })).toBeVisible()
  const afterDeletion = await keyboard?.observe('after-confirmed-delete', searchProjects)
  await assertDeleted(second)
  await closeNormally(second)

  const third = await launch('after-permanent-delete')
  await assertDeleted(third)
  await showTrash(third.page)
  await expect(third.page.getByText('Trash is empty', { exact: true })).toBeVisible()
  await button(home(third.page), 'Projects').click()
  await expect(button(third.page, `Open ${neighborTitle}`)).toBeVisible()
  await expect(button(third.page, `Open ${targetTitle}`)).toHaveCount(0)
  await closeNormally(third)
  const restarted = await retainOwnStore('after-delete-restart', path.basename(neighbor.filename))

  if (keyboard) {
    assert.ok(
      openings.every(
        ({ active }) =>
          active?.dialog === 'Delete Project Permanently' && active.name !== 'Delete Permanently',
      ),
      `The destructive action must not receive initial focus: ${JSON.stringify(openings)}`,
    )
    assert.ok(
      trap.every(({ returnedToTrigger, active }) => returnedToTrigger && active?.focusVisible),
      `Keyboard traversal must wrap within the confirmation: ${JSON.stringify(trap)}`,
    )
    assert.ok(
      dismissals.every(
        ({ returnedToTrigger, active }) => returnedToTrigger && active?.focusVisible,
      ),
      `Both dismissals must return visible focus to the same Delete button: ${JSON.stringify(dismissals)}`,
    )
    const completed = [afterRestore, afterDeletion]
    assert.ok(
      completed.every(
        (observation) =>
          observation?.returnedToTrigger &&
          observation.active?.focusVisible &&
          observation.active.name === 'Search projects',
      ),
      `Both successful actions must leave visible focus on Search projects in Trash: ${JSON.stringify(completed)}`,
    )
  }

  return {
    saved,
    restarted,
    packagedProjectTrash: {
      original,
      baseline,
      firstTrash,
      secondTrash,
      removed: { id, source },
      neighbor: neighborBefore,
      finalIndex: expectedFinalIndex,
      refusals: { openRefusal, trashedOpenRefusal, stale, unconfirmed },
      ...(keyboard && { keyboard: { trace: keyboard.trace, observations: keyboard.observations } }),
    },
  }
}
