import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository, UNCATEGORIZED_WORKSPACE_ID } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const createInput = { height: 64, title: 'Reveal fixture', width: 64 }
type Fixture = Awaited<ReturnType<typeof fixture>>

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-project-reveal-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'workspace')
  await mkdir(dataRoot)
  await mkdir(directory)
  const database = openAppDatabase(dataRoot, migrations)
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const services: ProjectService[] = []
  const makeService = () => {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(dataRoot, 'scratch'),
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = makeService()
  const workspace = await service.addWorkspace(
    { color: 'blue', displayName: 'Reveal workspace' },
    directory,
  )
  return {
    async cleanup() {
      for (const owner of services) {
        for (const tab of owner.getOpenTabs()) {
          await owner.discardAndClose(tab.id)
        }
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    database,
    dataRoot,
    directory,
    makeService,
    repository,
    root,
    service,
    shadow,
    workspace,
  }
}
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.cleanup()
  }
}
async function closedProject(f: Fixture) {
  const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
  await f.service.close(tab.id)
  const record = await f.repository.getProject(tab.id)
  assert.ok(record)
  return record
}
async function treeBytes(directory: string): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {}
  async function visit(current: string) {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name)
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.isDirectory()) {
        await visit(target)
      } else {
        assert.equal(entry.isFile(), true)
        result[path.relative(directory, target)] = await readFile(target)
      }
    }
  }
  await visit(directory)
  return result
}

// Real service/repository/filesystem boundaries; callbacks stand in only for the desktop shell.
test('opaque IDs reveal only their exact registered file and workspace without opening a Project', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const before = await readFile(record.canonicalPath)
    const files: string[] = []
    const directories: string[] = []
    await f.service.revealProject(record.localProjectKey, (file) => files.push(file))
    await f.service.revealWorkspace(f.workspace.id, async (directory) => {
      directories.push(directory)
      return ''
    })
    assert.deepEqual(files, [record.canonicalPath])
    assert.deepEqual(directories, [f.directory])
    assert.deepEqual(f.service.getOpenTabs(), [])
    assert.deepEqual(await readFile(record.canonicalPath), before)
    assert.deepEqual(await f.repository.getProject(record.localProjectKey), record)
    assert.deepEqual(await f.service.listTrash(), [])
  })
})

test('readonly registered locations remain revealable without requiring write access', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const before = await readFile(record.canonicalPath)
    await chmod(record.canonicalPath, 0o400)
    await chmod(f.directory, 0o500)
    try {
      assert.equal((await f.repository.workspaceAvailability(f.workspace)).writable, false)
      const locations: string[] = []
      await f.service.revealProject(record.localProjectKey, (file) => locations.push(file))
      await f.service.revealWorkspace(f.workspace.id, async (directory) => {
        locations.push(directory)
        return ''
      })
      assert.deepEqual(locations, [record.canonicalPath, f.directory])
      assert.deepEqual(await readFile(record.canonicalPath), before)
    } finally {
      await chmod(f.directory, 0o700)
      await chmod(record.canonicalPath, 0o600)
    }
  })
})

test('a present corrupt indexed package can be revealed without reading or repairing its document', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const corrupt = Buffer.from('Invalid .igs bytes retained for manual inspection')
    await writeFile(record.canonicalPath, corrupt)
    const [listed] = await f.service.list(f.workspace.id)
    assert.equal(listed.health, 'corrupt')
    const locations: string[] = []
    await f.service.revealProject(record.localProjectKey, (file) => locations.push(file))
    assert.deepEqual(locations, [record.canonicalPath])
    assert.deepEqual(await readFile(record.canonicalPath), corrupt)
    assert.deepEqual(f.service.getOpenTabs(), [])
    assert.equal((await f.repository.getProject(record.localProjectKey))!.fileHealth, 'corrupt')
  })
})

test('malformed, unknown and unindexed IDs never turn renderer paths into shell destinations', async () => {
  await withFixture(async (f) => {
    const unindexed = path.join(f.directory, 'unindexed.igs')
    await writeFile(unindexed, 'Present but not an indexed Project')
    let calls = 0
    const show = () => {
      calls++
    }
    for (const id of ['Projects', '../workspace/file.igs', f.directory, randomUUID()]) {
      await assert.rejects(f.service.revealProject(id, show), { code: 'PROJECT_INVALID_INPUT' })
    }
    await assert.rejects(f.service.revealProject(localProjectRecoveryKey(unindexed), show), {
      code: 'PROJECT_NOT_FOUND',
    })
    for (const id of ['Projects', '../workspace', f.directory, randomUUID()]) {
      await assert.rejects(
        f.service.revealWorkspace(id, async () => {
          calls++
          return ''
        }),
        { code: 'WORKSPACE_UNAVAILABLE' },
      )
    }
    assert.equal(calls, 0)
    assert.equal(await readFile(unindexed, 'utf8'), 'Present but not an indexed Project')
  })
})

test('missing file and missing workspace refuse before shell handoff without a fallback location', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const retained = `${record.canonicalPath}.retained`
    const disconnected = `${f.directory}-disconnected`
    const before = await readFile(record.canonicalPath)
    let calls = 0
    await rename(record.canonicalPath, retained)
    try {
      await assert.rejects(
        f.service.revealProject(record.localProjectKey, () => {
          calls++
        }),
        { code: 'PROJECT_NOT_READY' },
      )
    } finally {
      await rename(retained, record.canonicalPath)
    }
    await rename(f.directory, disconnected)
    try {
      await assert.rejects(
        f.service.revealProject(record.localProjectKey, () => {
          calls++
        }),
        { code: 'PROJECT_NOT_READY' },
      )
      await assert.rejects(
        f.service.revealWorkspace(f.workspace.id, async () => {
          calls++
          return ''
        }),
        { code: 'PROJECT_NOT_READY' },
      )
    } finally {
      await rename(disconnected, f.directory)
    }
    assert.equal(calls, 0)
    assert.deepEqual(await readFile(record.canonicalPath), before)
  })
})

test('unregistered folders and their former Project IDs cannot be revealed through stale cached ownership', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const before = await readFile(record.canonicalPath)
    await f.service.removeWorkspace(f.workspace.id)
    let calls = 0
    await assert.rejects(
      f.service.revealProject(record.localProjectKey, () => {
        calls++
      }),
      { code: 'PROJECT_NOT_FOUND' },
    )
    await assert.rejects(
      f.service.revealWorkspace(f.workspace.id, async () => {
        calls++
        return ''
      }),
      { code: 'WORKSPACE_UNAVAILABLE' },
    )
    assert.equal(calls, 0)
    assert.deepEqual(await readFile(record.canonicalPath), before)
  })
})

test('ordinary Trash and committed pending deletion both suppress Project shell handoff', async () => {
  for (const deleting of [false, true]) {
    await withFixture(async (f) => {
      const record = await closedProject(f)
      const before = await readFile(record.canonicalPath)
      await f.service.trashProject(record.localProjectKey)
      const [entry] = await f.service.listTrash()
      if (deleting) {
        await f.repository.trash.beginPermanentDelete(entry.id, entry.trashId, () => undefined)
      }
      let calls = 0
      await assert.rejects(
        f.service.revealProject(record.localProjectKey, () => {
          calls++
        }),
        { code: 'PROJECT_NOT_FOUND' },
      )
      assert.equal(calls, 0)
      assert.deepEqual(await readFile(record.canonicalPath), before)
      assert.equal(
        (await f.service.listTrash())[0].deletionStatus,
        deleting ? 'deleting' : 'trashed',
      )
    })
  }
})

test('file and parent symlink redirection refuse both shell boundaries without touching their targets', async () => {
  for (const mode of ['file', 'parent'] as const) {
    await withFixture(async (f) => {
      const record = await closedProject(f)
      const before = await readFile(record.canonicalPath)
      const retained =
        mode === 'file' ? `${record.canonicalPath}.retained` : `${f.directory}-retained`
      await rename(mode === 'file' ? record.canonicalPath : f.directory, retained)
      await symlink(retained, mode === 'file' ? record.canonicalPath : f.directory)
      try {
        let calls = 0
        await assert.rejects(
          f.service.revealProject(record.localProjectKey, () => {
            calls++
          }),
          { code: 'PROJECT_NOT_READY' },
        )
        if (mode === 'parent') {
          await assert.rejects(
            f.service.revealWorkspace(f.workspace.id, async () => {
              calls++
              return ''
            }),
            { code: 'PROJECT_NOT_READY' },
          )
        }
        assert.equal(calls, 0)
        assert.deepEqual(
          await readFile(
            mode === 'file' ? retained : path.join(retained, path.basename(record.canonicalPath)),
          ),
          before,
        )
      } finally {
        await unlink(mode === 'file' ? record.canonicalPath : f.directory)
        await rename(retained, mode === 'file' ? record.canonicalPath : f.directory)
      }
    })
  }
})

test('a real Trash publication after initial lookup wins over the stale reveal snapshot', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const before = await readFile(record.canonicalPath)
    const workspaceById = f.repository.workspaceById.bind(f.repository)
    f.repository.workspaceById = async (id) => {
      await f.repository.trash.moveToTrash(record, f.workspace, () => undefined)
      return await workspaceById(id)
    }
    let calls = 0
    try {
      await assert.rejects(
        f.service.revealProject(record.localProjectKey, () => {
          calls++
        }),
        { code: 'PROJECT_NOT_FOUND' },
      )
    } finally {
      f.repository.workspaceById = workspaceById
    }
    assert.equal(calls, 0)
    assert.deepEqual(await readFile(record.canonicalPath), before)
    assert.equal((await f.service.listTrash()).length, 1)
  })
})

test('shell failures are visible and leave dirty document, saved bytes, queue and recovery unchanged', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 7, y: -9 })
    await f.service.flushAutosave(tab.id)
    const now = new Date().toISOString()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: record.canonicalPath,
        created_at: now,
        document_id: record.documentId!,
        document_revision: record.documentRevision!,
        error_code: 'FIXTURE',
        error_message: 'Opaque retained terminal fixture',
        finished_at: now,
        frozen_payload_json: '{}',
        id: randomUUID(),
        local_project_key: tab.id,
        operation: 'illustrious-txt2img',
        staging_session_id: randomUUID(),
        started_at: null,
        status: 'failed',
        status_sequence: 0,
        updated_at: now,
      })
      .execute()
    const source = await readFile(record.canonicalPath)
    const tabs = structuredClone(f.service.getOpenTabs())
    const queue = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
    const recovery = await treeBytes(path.join(f.dataRoot, 'autosave'))
    assert.equal(tabs[0].dirty, true)
    assert.ok(Object.keys(recovery).length > 0)
    await assert.rejects(
      f.service.revealProject(tab.id, () => {
        throw new Error('File manager unavailable')
      }),
      { code: 'PROJECT_NOT_READY' },
    )
    for (const mode of ['message', 'throw']) {
      await assert.rejects(
        f.service.revealWorkspace(f.workspace.id, async () => {
          if (mode === 'throw') {
            throw new Error('File manager unavailable')
          }
          return 'No handler for this directory'
        }),
        { code: 'PROJECT_NOT_READY' },
      )
    }
    assert.deepEqual(await readFile(record.canonicalPath), source)
    assert.deepEqual(f.service.getOpenTabs(), tabs)
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      queue,
    )
    assert.deepEqual(await treeBytes(path.join(f.dataRoot, 'autosave')), recovery)
    const shown: string[] = []
    await f.service.revealProject(tab.id, (file) => shown.push(file))
    assert.deepEqual(shown, [record.canonicalPath])
    assert.deepEqual(f.service.getOpenTabs(), tabs)
  })
})

test('tab workspace identity survives Create, document edits, Undo, Redo, list and clean reopen', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    assert.equal(tab.workspaceId, f.workspace.id)
    assert.equal(
      (await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 5, y: 3 })).workspaceId,
      f.workspace.id,
    )
    assert.equal((await f.service.undo(tab.id)).workspaceId, f.workspace.id)
    assert.equal((await f.service.redo(tab.id)).workspaceId, f.workspace.id)
    assert.equal(f.service.getOpenTabs()[0].workspaceId, f.workspace.id)
    await f.service.discardAndClose(tab.id)
    const opened = await f.service.open(tab.id)
    assert.equal(opened.kind, 'opened')
    assert.ok(opened.kind === 'opened')
    assert.equal(opened.tab.workspaceId, f.workspace.id)
    assert.equal(f.service.getOpenTabs()[0].workspaceId, f.workspace.id)
    await f.service.close(tab.id)
    const defaultTab = await f.service.create({ ...createInput, title: 'Default workspace' })
    assert.equal(defaultTab.workspaceId, UNCATEGORIZED_WORKSPACE_ID)
    assert.equal(f.service.getOpenTabs()[0].workspaceId, UNCATEGORIZED_WORKSPACE_ID)
  })
})

test('recovered tab metadata uses the original registered workspace without mutating its saved package', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    const source = await readFile(record.canonicalPath)
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: -5, y: 9 })
    await f.service.flushAutosave(tab.id)
    const restarted = f.makeService()
    assert.equal((await restarted.open(tab.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(tab.id, 'recover')
    assert.equal(recovered.workspaceId, f.workspace.id)
    assert.equal(restarted.getOpenTabs()[0].workspaceId, f.workspace.id)
    assert.deepEqual(recovered.primaryBbox, { height: 64, width: 64, x: -5, y: 9 })
    assert.deepEqual(await readFile(record.canonicalPath), source)
    assert.equal(
      (await readIgsPackage(record.canonicalPath)).project.documentId,
      recovered.documentId,
    )
  })
})

test('execute-only workspace is unavailable to both reveal commands before shell handoff', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    let calls = 0
    await chmod(f.directory, 0o111)
    try {
      assert.equal(
        (await f.repository.workspaceAvailability(f.workspace)).availability,
        'inaccessible',
      )
      await assert.rejects(
        f.service.revealProject(record.localProjectKey, () => {
          calls++
        }),
        { code: 'PROJECT_NOT_READY' },
      )
      await assert.rejects(
        f.service.revealWorkspace(f.workspace.id, async () => {
          calls++
          return ''
        }),
        { code: 'PROJECT_NOT_READY' },
      )
      assert.equal(calls, 0)
    } finally {
      await chmod(f.directory, 0o700)
    }
  })
})
