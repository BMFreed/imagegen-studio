import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import { normalizeProjectRenameName } from '../../shared/projects/project-rename.js'
import {
  IGS_SAFETY_CEILINGS,
  IGS_SCHEMA_VERSION,
  type IgsManifestV1,
  type IgsProjectDocumentV1,
  parseProjectDocumentV1,
  projectAssetReferences,
  validateIgsPackageMetadataV1,
} from '../../shared/projects/project-schema.js'
import { isProjectWorkspaceId } from '../../shared/projects/project-workspaces.js'

import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import type { BigIntStats } from 'node:fs'

import { createHash, randomUUID } from 'node:crypto'
import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
} from 'node:fs'
import { mkdtemp, open, rm } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { DB } from '../db/database.types.js'
import type { ProjectIndexRecord, ProjectWorkspaceRecord } from './project-index.js'

import {
  type IgsAssetSource,
  type IgsPackageReadResult,
  readIgsPackage,
  saveIgsPackage,
} from './igs-package.js'
import {
  localProjectRecoveryKey,
  rawPathDerivedProjectRecoveryKey,
  refreshProjectLocationRegistry,
} from './project-identity.js'
import { assertProjectLocationRegistryCompatible } from './project-location-registry.js'
import { withProjectPathLock } from './project-path-lock.js'

export interface ProjectRelocationRecord {
  createdAt: string
  destinationPath: string
  documentId: string
  errorMessage: string | null
  kind: 'move' | 'rename'
  localProjectKey: string
  operationId: string
  project: ProjectIndexRecord
  rename: RenameDescriptor | null
  sourceParentWitness: ParentWitness
  sourcePath: string
  sourceSha256: string
  sourceWitness: FileWitness
  sourceWorkspaceId: string
  state: 'moved' | 'moving' | 'planned'
  targetParentWitness: ParentWitness
  targetSha256: string | null
  targetWitness: FileWitness | null
  targetWorkspaceId: string
}
export type ProjectRelocationResult = { kind: 'moved' } | { kind: 'pending'; message: string }
interface RenameDescriptor {
  members: IgsManifestV1['members']
  preview: IgsManifestV1['preview']
  projectJson: string
  targetDocumentRevision: string
  targetTitle: string
}
interface ParentWitness {
  dev: string
  ino: string
}
interface FileWitness extends ParentWitness {
  ctimeNs: string
  mtimeNs: string
  size: string
}
interface StoreOptions {
  afterDatabaseRepoint?: (record: ProjectRelocationRecord) => Promise<void>
  /** The renamed package is committed; a crash here must recover from its planned descriptor. */
  afterMetadataRename?: (record: ProjectRelocationRecord) => Promise<void>
  afterRename?: (record: ProjectRelocationRecord) => Promise<void>
  beforeDatabaseRepoint?: (record: ProjectRelocationRecord) => Promise<void>
  /** Causal seam; fresh synchronous source/destination guards follow before rename. */
  beforeFinalFileCheck?: (record: ProjectRelocationRecord) => Promise<void>
  beforeFinalize?: (record: ProjectRelocationRecord) => Promise<void>
  /** Causal seam; source digest and synchronous destination guards follow before replacement. */
  beforeMetadataReplace?: (record: ProjectRelocationRecord) => Promise<void>
  /** Test seam before the final candidate/absence checks and atomic metadata-only repoint. */
  beforeRelinkCommit?: () => Promise<void>
}
type RepointOwner = Pick<
  ProjectRelocationRecord,
  | 'destinationPath'
  | 'documentId'
  | 'localProjectKey'
  | 'project'
  | 'rename'
  | 'sourcePath'
  | 'sourceWorkspaceId'
  | 'targetWorkspaceId'
>
export class ProjectRelocationStoreError extends Error {
  constructor(
    readonly code: 'PROJECT_MOVE_CONFLICT' | 'PROJECT_MOVE_INVALID' | 'PROJECT_MOVE_PENDING',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectRelocationStoreError'
  }
}

function witness(s: BigIntStats): FileWitness {
  return {
    ctimeNs: s.ctimeNs.toString(),
    dev: s.dev.toString(),
    ino: s.ino.toString(),
    mtimeNs: s.mtimeNs.toString(),
    size: s.size.toString(),
  }
}

/** Invoke's journal -> filesystem move/fsync -> transactional repoint -> startup recovery. */
export class ProjectRelocationStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly options: StoreOptions = {},
  ) {}

  async beginMove(
    project: ProjectIndexRecord,
    sourceWorkspace: ProjectWorkspaceRecord,
    targetWorkspace: ProjectWorkspaceRecord,
    guardSync: () => void,
  ): Promise<ProjectRelocationRecord> {
    return await this.beginRelocation(project, sourceWorkspace, targetWorkspace, guardSync, null)
  }

  async beginRename(
    project: ProjectIndexRecord,
    workspace: ProjectWorkspaceRecord,
    name: string,
    guardSync: () => void,
  ): Promise<ProjectRelocationRecord> {
    const title = normalizeProjectRenameName(name)
    if (title === null) {
      throw invalid()
    }
    return await this.beginRelocation(project, workspace, workspace, guardSync, title)
  }

  async finishMove(
    input: ProjectRelocationRecord,
    guardSync: () => void = () => undefined,
    beforeFinalize?: () => Promise<void>,
  ): Promise<ProjectRelocationResult> {
    input = structuredClone(input)
    assertKey(input.localProjectKey)
    assertUuid(input.operationId)
    return await withMoveLocks(input.sourcePath, input.destinationPath, async () => {
      const current = await this.get(input.localProjectKey)
      if (!current || !sameAuthority(input, current)) {
        throw conflict()
      }
      const record = current
      try {
        guardSync()
        // Never perform a filesystem effect without rereading positive authority first.
        await this.db
          .transaction()
          .execute((transaction) => assertOperationalRows(transaction, record))
        await this.db
          .updateTable('project_relocation')
          .set({ error_message: null, state: 'moving', updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
        const fresh = await this.get(record.localProjectKey)
        if (!fresh || !sameAuthority(record, fresh)) {
          throw conflict()
        }
        const source = entryNow(record.sourcePath)
        const destination = entryNow(record.destinationPath)
        if (source && destination && record.sourcePath !== record.destinationPath) {
          throw changed()
        }
        if (!source && !destination) {
          throw changed()
        }
        if (source && record.sourcePath !== record.destinationPath) {
          await hashChecked(record.sourcePath, record.sourceWitness, true, record.sourceSha256)
          await this.options.beforeFinalFileCheck?.(record)
          const finalAuthority = await this.get(record.localProjectKey)
          if (!finalAuthority || !sameAuthority(record, finalAuthority)) {
            throw conflict()
          }
          guardSync()
          renameCheckedNow(record)
          await this.options.afterRename?.(record)
        }
        if (record.kind === 'rename') {
          await this.finishMetadataRename(record, guardSync)
        }
        // Move retains the original inode/digest. Rename retains its verified replacement witness.
        await verifyCompleted(record)
        syncCompletedNow(record)
        await this.db
          .updateTable('project_relocation')
          .set({ state: 'moved', updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
        await this.options.beforeDatabaseRepoint?.(record)
        await verifyCompleted(record)
        const moved = completedWitnessNow(record)
        guardSync()
        await this.db.transaction().execute(async (transaction) => {
          const row = await transaction
            .selectFrom('project_relocation')
            .selectAll()
            .where('local_project_key', '=', record.localProjectKey)
            .executeTakeFirst()
          if (!row || !sameAuthority(record, fromRow(row))) {
            throw conflict()
          }
          await assertOperationalRows(transaction, record)
          guardSync()
          await repoint(transaction, record, moved)
          guardSync()
        })
        refreshProjectLocationRegistry(this.db)
        await this.options.afterDatabaseRepoint?.(record)
        await beforeFinalize?.()
        await this.options.beforeFinalize?.(record)
        await verifyCompleted(record)
        completedWitnessNow(record)
        guardSync()
        await this.db.transaction().execute(async (transaction) => {
          const row = await transaction
            .selectFrom('project_relocation')
            .selectAll()
            .where('local_project_key', '=', record.localProjectKey)
            .executeTakeFirst()
          if (!row || !sameAuthority(record, fromRow(row))) {
            throw conflict()
          }
          await assertOperationalRows(transaction, record)
          guardSync()
          await transaction
            .deleteFrom('project_relocation')
            .where('local_project_key', '=', record.localProjectKey)
            .where('operation_id', '=', record.operationId)
            .execute()
        })
        return { kind: 'moved' }
      } catch (error) {
        const message =
          error instanceof ProjectRelocationStoreError
            ? error.message
            : `Project ${record.kind === 'rename' ? 'Rename' : 'Move'} could not finish. Its recovery record was kept; restore access to the workspace and try again.`
        await this.db
          .updateTable('project_relocation')
          .set({ error_message: message, updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
          .catch(() => undefined)
        return { kind: 'pending', message }
      }
    })
  }

  async get(projectId: string): Promise<ProjectRelocationRecord | null> {
    assertKey(projectId)
    const row = await this.db
      .selectFrom('project_relocation')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .executeTakeFirst()
    return row ? fromRow(row) : null
  }

  async list(): Promise<ProjectRelocationRecord[]> {
    return (
      await this.db
        .selectFrom('project_relocation')
        .selectAll()
        .orderBy('created_at')
        .orderBy('local_project_key')
        .execute()
    ).map(fromRow)
  }

  async recoverPendingMoves(guardSync?: (record: ProjectRelocationRecord) => void): Promise<void> {
    for (const record of await this.list()) {
      await this.finishMove(record, () => guardSync?.(record))
    }
  }

  /** Reconnect an already-existing file through the same stable-name repoint; never move it. */
  async relinkMissingProject(
    project: ProjectIndexRecord,
    sourceWorkspace: ProjectWorkspaceRecord,
    targetWorkspace: ProjectWorkspaceRecord,
    candidatePath: string,
    guardSync: () => void,
    validateCandidate: (saved: IgsPackageReadResult, candidateKey: string) => Promise<void>,
  ): Promise<void> {
    project = structuredClone(project)
    sourceWorkspace = structuredClone(sourceWorkspace)
    targetWorkspace = structuredClone(targetWorkspace)
    assertKey(project.localProjectKey)
    assertUuid(project.documentId)
    assertUuid(project.documentRevision)
    if (
      project.fileHealth !== 'missing' ||
      !canonical(project.canonicalPath) ||
      !canonical(candidatePath) ||
      project.canonicalPath === candidatePath ||
      path.extname(candidatePath).toLowerCase() !== '.igs' ||
      path.extname(project.canonicalPath).toLowerCase() !== '.igs' ||
      !isProjectWorkspaceId(sourceWorkspace.id) ||
      !isProjectWorkspaceId(targetWorkspace.id) ||
      sourceWorkspace.id !== project.workspaceId ||
      path.dirname(project.canonicalPath) !== sourceWorkspace.directoryPath ||
      path.dirname(candidatePath) !== targetWorkspace.directoryPath ||
      localProjectRecoveryKey(project.canonicalPath) !== project.localProjectKey
    ) {
      throw new ProjectRelocationStoreError(
        'PROJECT_MOVE_INVALID',
        'The missing Project or located file could not be verified. Refresh Home and choose its saved file again.',
      )
    }
    await withMoveLocks(project.canonicalPath, candidatePath, async () => {
      guardSync()
      const sourceParent = readableParent(sourceWorkspace.directoryPath)
      const targetParent = readableParent(targetWorkspace.directoryPath)
      const assertFiles = () => {
        guardSync()
        assertReadableParent(sourceWorkspace.directoryPath, sourceParent)
        assertReadableParent(targetWorkspace.directoryPath, targetParent)
        if (entryNow(project.canonicalPath) !== null) {
          throw changed()
        }
        // ENOENT from a vanished parent cannot authorize adoption of another file.
        assertReadableParent(sourceWorkspace.directoryPath, sourceParent)
      }
      assertFiles()
      const candidate = entryNow(candidatePath)
      if (!candidate || !regular(candidate) || realpathSync(candidatePath) !== candidatePath) {
        throw changed()
      }
      const candidateWitness = witness(candidate)
      const saved = await readIgsPackage(candidatePath)
      assertFiles()
      if (
        saved.project.documentId !== project.documentId ||
        saved.project.documentRevision !== project.documentRevision
      ) {
        throw changed()
      }
      const candidateKey = rawPathDerivedProjectRecoveryKey(candidatePath)
      const digest = await hashChecked(candidatePath, candidateWitness, true)
      assertFiles()
      await validateCandidate(saved, candidateKey)
      assertFiles()
      const thumbnailSha256 = saved.manifest.members.find(
        (member) => member.path === 'preview/thumbnail.webp',
      )?.sha256
      if (!thumbnailSha256) {
        throw changed()
      }
      const owner: RepointOwner = {
        destinationPath: candidatePath,
        documentId: project.documentId,
        localProjectKey: project.localProjectKey,
        project: {
          ...project,
          bboxHeight: saved.project.primaryBbox.height,
          bboxWidth: saved.project.primaryBbox.width,
          displayName: saved.project.title,
          previewStatus: saved.manifest.preview.status,
          thumbnailSha256,
        },
        rename: null,
        sourcePath: project.canonicalPath,
        sourceWorkspaceId: sourceWorkspace.id,
        targetWorkspaceId: targetWorkspace.id,
      }
      await this.db.transaction().execute(async (transaction) => {
        const original = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', project.localProjectKey)
          .executeTakeFirst()
        guardSync()
        if (
          !original ||
          original.canonical_path !== project.canonicalPath ||
          original.workspace_id !== sourceWorkspace.id ||
          original.document_id !== project.documentId ||
          original.document_revision !== project.documentRevision ||
          original.file_health !== 'missing' ||
          original.trashed_at !== null
        ) {
          throw conflict()
        }
        await assertRelinkDestination(transaction, owner, candidateKey, candidateWitness)
        guardSync()
        await assertOperationalRows(transaction, owner)
        guardSync()
        await validateCandidate(saved, candidateKey)
        assertFiles()
        await this.options.beforeRelinkCommit?.()
        await hashChecked(candidatePath, candidateWitness, true, digest)
        assertFiles()
        await repoint(transaction, owner, candidateWitness)
        assertFiles()
        if (!sameOriginal(entryNow(candidatePath), candidateWitness)) {
          throw changed()
        }
        assertProjectLocationRegistryCompatible(this.db)
        guardSync()
      })
      // A post-commit projection failure stays fail-closed; it cannot undo committed SQLite.
      refreshProjectLocationRegistry(this.db)
    }).catch((error: unknown) => {
      if (error instanceof ProjectRelocationStoreError) {
        throw new ProjectRelocationStoreError(
          error.code === 'PROJECT_MOVE_INVALID' ? error.code : 'PROJECT_MOVE_CONFLICT',
          'The missing Project or located file changed, or the selected location already belongs to another Project. Refresh Home and choose its saved file again. No file was moved or replaced.',
        )
      }
      throw error
    })
  }
  private async beginRelocation(
    project: ProjectIndexRecord,
    sourceWorkspace: ProjectWorkspaceRecord,
    targetWorkspace: ProjectWorkspaceRecord,
    guardSync: () => void,
    title: string | null,
  ): Promise<ProjectRelocationRecord> {
    project = structuredClone(project)
    sourceWorkspace = structuredClone(sourceWorkspace)
    targetWorkspace = structuredClone(targetWorkspace)
    assertProject(project)
    const documentId = project.documentId
    assertUuid(documentId)
    if (
      !isProjectWorkspaceId(sourceWorkspace.id) ||
      !isProjectWorkspaceId(targetWorkspace.id) ||
      sourceWorkspace.id !== project.workspaceId ||
      (title === null
        ? sourceWorkspace.id === targetWorkspace.id
        : sourceWorkspace.id !== targetWorkspace.id) ||
      path.dirname(project.canonicalPath) !== sourceWorkspace.directoryPath ||
      !canonical(targetWorkspace.directoryPath)
    ) {
      throw invalid()
    }
    if (localProjectRecoveryKey(project.canonicalPath) !== project.localProjectKey) {
      throw invalid()
    }
    const destinationPath = path.join(
      targetWorkspace.directoryPath,
      title === null ? path.basename(project.canonicalPath) : `${title}.igs`,
    )
    return await withMoveLocks(project.canonicalPath, destinationPath, async () => {
      guardSync()
      const sourceParentWitness = parentOf(sourceWorkspace.directoryPath)
      const targetParentWitness = parentOf(targetWorkspace.directoryPath)
      if (sourceParentWitness.dev !== targetParentWitness.dev) {
        throw new ProjectRelocationStoreError(
          'PROJECT_MOVE_INVALID',
          'Move requires both workspaces to be on the same filesystem.',
        )
      }
      assertNoCollision(destinationPath, title !== null ? project.canonicalPath : undefined)
      const source = entryNow(project.canonicalPath)
      if (
        !source ||
        !regular(source) ||
        realpathSync(project.canonicalPath) !== project.canonicalPath ||
        fingerprint(witness(source)) !== project.fileFingerprint
      ) {
        throw changed()
      }
      const portable = await readIgsPackage(project.canonicalPath)
      if (
        portable.project.documentId !== project.documentId ||
        portable.project.documentRevision !== project.documentRevision
      ) {
        throw changed()
      }
      const sourceWitness = witness(source)
      if (sourceWitness.dev !== sourceParentWitness.dev) {
        throw invalid()
      }
      const sourceSha256 = await hashChecked(project.canonicalPath, sourceWitness, true)
      const rename: RenameDescriptor | null =
        title === null ? null : makeRenameDescriptor(portable.manifest, portable.project, title)
      guardSync()
      assertParentsNow(
        sourceWorkspace.directoryPath,
        sourceParentWitness,
        targetWorkspace.directoryPath,
        targetParentWitness,
      )
      assertNoCollision(destinationPath, title !== null ? project.canonicalPath : undefined)
      if (!sameOriginal(entryNow(project.canonicalPath), sourceWitness)) {
        throw changed()
      }
      const now = new Date().toISOString()
      const record: ProjectRelocationRecord = {
        createdAt: now,
        destinationPath,
        documentId,
        errorMessage: null,
        kind: rename ? 'rename' : 'move',
        localProjectKey: project.localProjectKey,
        operationId: randomUUID(),
        project,
        rename,
        sourceParentWitness,
        sourcePath: project.canonicalPath,
        sourceSha256,
        sourceWitness,
        sourceWorkspaceId: sourceWorkspace.id,
        state: 'planned',
        targetParentWitness,
        targetSha256: null,
        targetWitness: null,
        targetWorkspaceId: targetWorkspace.id,
      }
      await this.db.transaction().execute(async (transaction) => {
        await assertOperationalRows(transaction, record)
        const existing = await transaction
          .selectFrom('project_relocation')
          .selectAll()
          .where((eb) =>
            eb.or([
              eb('local_project_key', '=', record.localProjectKey),
              eb('source_path', 'in', [record.sourcePath, record.destinationPath]),
              eb('destination_path', 'in', [record.sourcePath, record.destinationPath]),
            ]),
          )
          .execute()
        if (existing.length) {
          throw conflict()
        }
        const indexed = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', record.localProjectKey)
          .executeTakeFirst()
        if (
          !indexed ||
          indexed.canonical_path !== record.sourcePath ||
          indexed.file_fingerprint !== project.fileFingerprint ||
          indexed.document_id !== record.documentId ||
          indexed.workspace_id !== sourceWorkspace.id ||
          indexed.trashed_at !== null
        ) {
          throw conflict()
        }
        guardSync()
        await transaction.insertInto('project_relocation').values(toRow(record, now)).execute()
        guardSync()
      })
      return record
    })
  }
  private async finishMetadataRename(
    record: ProjectRelocationRecord,
    guardSync: () => void,
  ): Promise<void> {
    const descriptor = record.rename
    if (!descriptor) {
      throw invalid()
    }
    if (record.targetWitness) {
      await verifyCompleted(record)
      return
    }
    if (sameMoved(entryNow(record.destinationPath), record.sourceWitness)) {
      await hashChecked(record.destinationPath, record.sourceWitness, false, record.sourceSha256)
      originalMetadataWitnessNow(record)
      const portable = await readIgsPackage(record.destinationPath)
      const project = parseProjectDocumentV1(JSON.parse(descriptor.projectJson))
      if (
        !isDeepStrictEqual(
          { ...portable.project, documentRevision: null, title: null },
          { ...project, documentRevision: null, title: null },
        ) ||
        !isDeepStrictEqual(portable.manifest.preview, descriptor.preview) ||
        !isDeepStrictEqual(
          sortedMembers(portable.manifest.members.filter((m) => m.path !== 'project.json')),
          descriptor.members.filter((m) => m.path !== 'project.json'),
        )
      ) {
        throw changed()
      }
      const scratch = await mkdtemp(path.join(path.dirname(record.destinationPath), '.igs-rename-'))
      try {
        const assets: Record<string, IgsAssetSource> = {}
        let index = 0
        for (const memberPath of new Set(projectAssetReferences(project).map((m) => m.path))) {
          const destination = path.join(scratch, `${index++}.member`)
          await portable.extractMemberToFile(memberPath, destination)
          assets[memberPath] = { sourcePath: destination }
        }
        await saveIgsPackage(
          record.destinationPath,
          {
            assets,
            preview: {
              merged: await portable.readMember('preview/merged.png'),
              rect: descriptor.preview.rect,
              status: descriptor.preview.status,
              thumbnail: await portable.readMember('preview/thumbnail.webp'),
            },
            project,
            projectJson: Buffer.from(descriptor.projectJson, 'utf8'),
          },
          {
            beforeRename: async () => {
              await this.options.beforeMetadataReplace?.(record)
              await hashChecked(
                record.destinationPath,
                record.sourceWitness,
                false,
                record.sourceSha256,
              )
              const authority = await this.get(record.localProjectKey)
              if (!authority || !sameAuthority(record, authority)) {
                throw conflict()
              }
              guardSync()
              originalMetadataWitnessNow(record)
            },
          },
        )
        await this.options.afterMetadataRename?.(record)
      } finally {
        await rm(scratch, { force: true, recursive: true }).catch((error: unknown) => {
          process.emitWarning(`Project Rename scratch cleanup failed: ${String(error)}`)
        })
      }
    }
    // The planned exact document/member descriptor is durable before the IGS commit point.
    // It covers a crash after package replacement but before this replacement witness is stored.
    const target = await verifyRenamedPackage(record)
    guardSync()
    await this.db.transaction().execute(async (transaction) => {
      const row = await transaction
        .selectFrom('project_relocation')
        .selectAll()
        .where('local_project_key', '=', record.localProjectKey)
        .executeTakeFirst()
      if (!row || !sameAuthority(record, fromRow(row))) {
        throw conflict()
      }
      await assertOperationalRows(transaction, record)
      guardSync()
      await transaction
        .updateTable('project_relocation')
        .set({
          target_sha256: target.sha256,
          target_witness_json: JSON.stringify(target.witness),
          updated_at: new Date().toISOString(),
        })
        .where('local_project_key', '=', record.localProjectKey)
        .where('operation_id', '=', record.operationId)
        .execute()
    })
    record.targetSha256 = target.sha256
    record.targetWitness = target.witness
  }
}
async function assertRelinkDestination(
  db: Transaction<DB>,
  owner: RepointOwner,
  candidateKey: string,
  candidateWitness: FileWitness,
): Promise<void> {
  const paths = [owner.sourcePath, owner.destinationPath]
  const relocation = await db
    .selectFrom('project_relocation')
    .select('local_project_key')
    .where((eb) =>
      eb.or([
        eb('local_project_key', 'in', [owner.localProjectKey, candidateKey]),
        eb('source_path', 'in', paths),
        eb('destination_path', 'in', paths),
      ]),
    )
    .executeTakeFirst()
  const retired = await db
    .selectFrom('project_identity_retired_key')
    .select('local_project_key')
    .where('local_project_key', 'in', [owner.localProjectKey, candidateKey])
    .executeTakeFirst()
  const bindings = await db
    .selectFrom('project_identity_binding')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', candidateKey),
        eb('canonical_path', '=', owner.destinationPath),
      ]),
    )
    .execute()
  if (
    relocation ||
    retired ||
    bindings.some(
      (binding) =>
        binding.local_project_key !== owner.localProjectKey ||
        binding.canonical_path !== owner.sourcePath ||
        binding.document_id !== owner.documentId,
    )
  ) {
    throw conflict()
  }
  if (candidateKey !== owner.localProjectKey) {
    // A derived key with any operational history is an owner, not a disposable scan cache.
    for (const table of [
      'generation_queue_item',
      'generation_candidate_receipt',
      'generation_acceptance_journal',
      'project_file_lifecycle',
      'generation_seed_cursor',
      'generation_staging_discarded_session',
    ] as const) {
      if (
        await db
          .selectFrom(table)
          .select('local_project_key')
          .where('local_project_key', '=', candidateKey)
          .executeTakeFirst()
      ) {
        throw conflict()
      }
    }
  }
  const indexed = await db
    .selectFrom('project_index')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', candidateKey),
        eb('canonical_path', '=', owner.destinationPath),
      ]),
    )
    .execute()
  for (const row of indexed) {
    if (
      row.local_project_key === owner.localProjectKey &&
      row.canonical_path === owner.sourcePath
    ) {
      continue
    }
    if (
      row.local_project_key !== candidateKey ||
      candidateKey === owner.localProjectKey ||
      row.canonical_path !== owner.destinationPath ||
      row.workspace_id !== owner.targetWorkspaceId ||
      row.document_id !== owner.documentId ||
      row.document_revision !== owner.project.documentRevision ||
      row.file_health !== 'ready' ||
      row.file_fingerprint !== fingerprint(candidateWitness) ||
      row.trashed_at !== null ||
      row.last_opened_at !== null
    ) {
      throw conflict()
    }
    // Keep the authoritative missing identity; this row was only an unowned scan projection.
    await db.deleteFrom('project_index').where('local_project_key', '=', candidateKey).execute()
  }
}
async function assertOperationalRows(
  db: Kysely<DB> | Transaction<DB>,
  record: RepointOwner,
): Promise<void> {
  const paths = [record.sourcePath, record.destinationPath]
  const workspaces = await db
    .selectFrom('project_workspace')
    .selectAll()
    .where('id', 'in', [record.sourceWorkspaceId, record.targetWorkspaceId])
    .execute()
  if (
    !workspaces.some(
      (w) =>
        w.id === record.sourceWorkspaceId && w.directory_path === path.dirname(record.sourcePath),
    ) ||
    !workspaces.some(
      (w) =>
        w.id === record.targetWorkspaceId &&
        w.directory_path === path.dirname(record.destinationPath),
    )
  ) {
    throw conflict()
  }
  const lifecycle = await db
    .selectFrom('project_file_lifecycle')
    .select('local_project_key')
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .executeTakeFirst()
  const acceptance = await db
    .selectFrom('generation_acceptance_journal')
    .select('local_project_key')
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .executeTakeFirst()
  if (lifecycle || acceptance) {
    throw conflict()
  }
  const queue = await db
    .selectFrom('generation_queue_item')
    .select(['local_project_key', 'canonical_project_path', 'document_id', 'status'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    queue.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_project_path) ||
        row.document_id !== record.documentId ||
        !['canceled', 'completed', 'failed'].includes(row.status),
    )
  ) {
    throw conflict()
  }
  const receipts = await db
    .selectFrom('generation_candidate_receipt')
    .select(['local_project_key', 'canonical_project_path', 'status'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    receipts.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_project_path) ||
        row.status !== 'completed',
    )
  ) {
    throw conflict()
  }
  const bindings = await db
    .selectFrom('project_identity_binding')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    bindings.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        row.document_id !== record.documentId ||
        !paths.includes(row.canonical_path),
    )
  ) {
    throw conflict()
  }
  const indexed = await db
    .selectFrom('project_index')
    .select(['local_project_key', 'canonical_path', 'document_id', 'trashed_at'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    indexed.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_path) ||
        row.document_id !== record.documentId ||
        row.trashed_at !== null,
    )
  ) {
    throw conflict()
  }
}
async function repoint(
  db: Transaction<DB>,
  record: RepointOwner,
  moved: FileWitness,
): Promise<void> {
  await db
    .insertInto('project_identity_binding')
    .values({
      canonical_path: record.destinationPath,
      document_id: record.documentId,
      local_project_key: record.localProjectKey,
    })
    .onConflict((c) =>
      c
        .column('local_project_key')
        .doUpdateSet({ canonical_path: record.destinationPath, document_id: record.documentId }),
    )
    .execute()
  const p = record.project
  const now = new Date().toISOString()
  const values = {
    bbox_height: p.bboxHeight,
    bbox_width: p.bboxWidth,
    canonical_path: record.destinationPath,
    diagnostic_code: null,
    display_name: record.rename?.targetTitle ?? p.displayName,
    document_id: record.documentId,
    document_revision: record.rename?.targetDocumentRevision ?? p.documentRevision,
    file_fingerprint: fingerprint(moved),
    file_health: 'ready',
    file_mtime_ns: moved.mtimeNs,
    file_size_bytes: Number(moved.size),
    indexed_at: now,
    last_opened_at: p.lastOpenedAt,
    local_project_key: record.localProjectKey,
    preview_status: p.previewStatus,
    preview_thumbnail_sha256: p.thumbnailSha256,
    search_name: (record.rename?.targetTitle ?? p.displayName).normalize('NFKC').toLowerCase(),
    trashed_at: null,
    workspace_id: record.targetWorkspaceId,
  }
  await db
    .insertInto('project_index')
    .values(values)
    .onConflict((c) => c.column('local_project_key').doUpdateSet(values))
    .execute()
  await db
    .updateTable('generation_queue_item')
    .set({ canonical_project_path: record.destinationPath })
    .where('local_project_key', '=', record.localProjectKey)
    .execute()
  await db
    .updateTable('generation_candidate_receipt')
    .set({ canonical_project_path: record.destinationPath })
    .where('local_project_key', '=', record.localProjectKey)
    .execute()
}
async function withMoveLocks<T>(
  source: string,
  destination: string,
  use: () => Promise<T>,
): Promise<T> {
  if (!canonical(source) || !canonical(destination)) {
    throw invalid()
  }
  if (source === destination) {
    return await withProjectPathLock(source, use)
  }
  const [first, second] = [source, destination].sort()
  return await withProjectPathLock(first, () => withProjectPathLock(second, use))
}
function canonical(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value
}
function assertKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^project-v1-[a-f0-9]{64}$/.test(value)) {
    throw invalid()
  }
}
function assertUuid(value: unknown): asserts value is string {
  if (!isProjectDocumentId(value)) {
    throw invalid()
  }
}
function assertProject(value: unknown): asserts value is ProjectIndexRecord {
  if (!value || typeof value !== 'object') {
    throw invalid()
  }
  const p = value as ProjectIndexRecord
  assertKey(p.localProjectKey)
  assertUuid(p.documentId)
  assertUuid(p.documentRevision)
  if (
    !canonical(p.canonicalPath) ||
    path.extname(p.canonicalPath).toLowerCase() !== '.igs' ||
    !isProjectWorkspaceId(p.workspaceId) ||
    p.fileHealth !== 'ready' ||
    typeof p.displayName !== 'string' ||
    !p.displayName ||
    Buffer.byteLength(p.displayName) > IGS_SAFETY_CEILINGS.titleBytes ||
    typeof p.fileFingerprint !== 'string' ||
    !/^\d+:\d+:\d+:-?\d+:-?\d+$/.test(p.fileFingerprint) ||
    !Number.isSafeInteger(p.bboxWidth) ||
    !Number.isSafeInteger(p.bboxHeight) ||
    p.bboxWidth! <= 0 ||
    p.bboxHeight! <= 0 ||
    !['empty', 'rendered', 'unavailable'].includes(p.previewStatus ?? '') ||
    !(p.thumbnailSha256 === null || /^[a-f0-9]{64}$/.test(p.thumbnailSha256)) ||
    !(
      p.lastOpenedAt === null ||
      (typeof p.lastOpenedAt === 'string' && Number.isFinite(Date.parse(p.lastOpenedAt)))
    )
  ) {
    throw invalid()
  }
}
function parseWitness(input: string, file: false): ParentWitness
function parseWitness(input: string, file: true): FileWitness
function parseWitness(input: string, file: boolean): FileWitness | ParentWitness {
  if (Buffer.byteLength(input) > 2048) {
    throw invalid()
  }
  const value: unknown = JSON.parse(input)
  if (!value || typeof value !== 'object') {
    throw invalid()
  }
  const o = value as Record<string, unknown>
  if (
    Object.keys(o).sort().join(',') !== (file ? 'ctimeNs,dev,ino,mtimeNs,size' : 'dev,ino') ||
    !unsigned(o.dev) ||
    !unsigned(o.ino) ||
    (file && (!unsigned(o.size) || !signed(o.mtimeNs) || !signed(o.ctimeNs)))
  ) {
    throw invalid()
  }
  return value as FileWitness | ParentWitness
}
function unsigned(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value)
}
function signed(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d{1,30}$/.test(value)
}
function sortedMembers(members: IgsManifestV1['members']): IgsManifestV1['members'] {
  return [...members].sort((a, b) => a.path.localeCompare(b.path))
}
function makeRenameDescriptor(
  manifest: IgsManifestV1,
  source: IgsProjectDocumentV1,
  title: string,
): RenameDescriptor {
  const project = parseProjectDocumentV1({ ...source, documentRevision: randomUUID(), title })
  const projectJson = JSON.stringify(project)
  return {
    members: sortedMembers(
      manifest.members.map((member) =>
        member.path === 'project.json'
          ? {
              bytes: Buffer.byteLength(projectJson),
              path: member.path,
              sha256: createHash('sha256').update(projectJson).digest('hex'),
            }
          : member,
      ),
    ),
    preview: structuredClone(manifest.preview),
    projectJson,
    targetDocumentRevision: project.documentRevision,
    targetTitle: title,
  }
}
function parseRenameDescriptor(input: string, source: ProjectIndexRecord): RenameDescriptor {
  if (
    Buffer.byteLength(input) >
    2 * IGS_SAFETY_CEILINGS.projectJsonBytes + IGS_SAFETY_CEILINGS.manifestJsonBytes + 4096
  ) {
    throw invalid()
  }
  const value: unknown = JSON.parse(input)
  if (!value || typeof value !== 'object') {
    throw invalid()
  }
  const o = value as Record<string, unknown>
  if (
    Object.keys(o).sort().join(',') !==
      'members,preview,projectJson,targetDocumentRevision,targetTitle' ||
    typeof o.projectJson !== 'string' ||
    Buffer.byteLength(o.projectJson) > IGS_SAFETY_CEILINGS.projectJsonBytes ||
    normalizeProjectRenameName(o.targetTitle) !== o.targetTitle
  ) {
    throw invalid()
  }
  const project = parseProjectDocumentV1(JSON.parse(o.projectJson))
  const { manifest } = validateIgsPackageMetadataV1(
    {
      documentId: project.documentId,
      documentRevision: project.documentRevision,
      members: o.members,
      preview: o.preview,
      schemaVersion: IGS_SCHEMA_VERSION,
    },
    project,
  )
  const documentMember = manifest.members.find((member) => member.path === 'project.json')
  if (
    project.documentId !== source.documentId ||
    project.documentRevision !== o.targetDocumentRevision ||
    project.documentRevision === source.documentRevision ||
    project.title !== o.targetTitle ||
    documentMember?.bytes !== Buffer.byteLength(o.projectJson) ||
    documentMember.sha256 !== createHash('sha256').update(o.projectJson).digest('hex') ||
    !isDeepStrictEqual(o.members, sortedMembers(manifest.members))
  ) {
    throw invalid()
  }
  return {
    members: manifest.members,
    preview: manifest.preview,
    projectJson: o.projectJson,
    targetDocumentRevision: project.documentRevision,
    targetTitle: project.title,
  }
}
function fromRow(row: Selectable<DB['project_relocation']>): ProjectRelocationRecord {
  try {
    if (Buffer.byteLength(row.project_json) > IGS_SAFETY_CEILINGS.manifestJsonBytes) {
      throw invalid()
    }
    const project: unknown = JSON.parse(row.project_json)
    assertProject(project)
    const sourceParentWitness = parseWitness(row.source_parent_witness_json, false)
    const targetParentWitness = parseWitness(row.target_parent_witness_json, false)
    const sourceWitness = parseWitness(row.source_witness_json, true)
    const rename = row.rename_json === null ? null : parseRenameDescriptor(row.rename_json, project)
    const targetWitness =
      row.target_witness_json === null ? null : parseWitness(row.target_witness_json, true)
    assertKey(row.local_project_key)
    assertUuid(row.operation_id)
    assertUuid(row.document_id)
    if (
      !canonical(row.source_path) ||
      !canonical(row.destination_path) ||
      !['move', 'rename'].includes(row.operation_kind) ||
      (row.operation_kind === 'move'
        ? rename !== null ||
          row.source_path === row.destination_path ||
          targetWitness !== null ||
          row.target_sha256 !== null ||
          path.basename(row.source_path) !== path.basename(row.destination_path) ||
          row.source_workspace_id === row.target_workspace_id
        : rename === null ||
          path.basename(row.destination_path) !== `${rename.targetTitle}.igs` ||
          row.source_workspace_id !== row.target_workspace_id ||
          path.dirname(row.source_path) !== path.dirname(row.destination_path)) ||
      !isProjectWorkspaceId(row.source_workspace_id) ||
      !isProjectWorkspaceId(row.target_workspace_id) ||
      row.local_project_key !== project.localProjectKey ||
      row.document_id !== project.documentId ||
      row.source_path !== project.canonicalPath ||
      project.workspaceId !== row.source_workspace_id ||
      project.fileFingerprint !== fingerprint(sourceWitness) ||
      sourceParentWitness.dev !== targetParentWitness.dev ||
      sourceWitness.dev !== sourceParentWitness.dev ||
      !/^[a-f0-9]{64}$/.test(row.source_sha256) ||
      (targetWitness === null
        ? row.target_sha256 !== null
        : row.target_sha256 === null ||
          !/^[a-f0-9]{64}$/.test(row.target_sha256) ||
          targetWitness.dev !== targetParentWitness.dev) ||
      !['moved', 'moving', 'planned'].includes(row.state) ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !(row.error_message === null || typeof row.error_message === 'string')
    ) {
      throw invalid()
    }
    return {
      createdAt: row.created_at,
      destinationPath: row.destination_path,
      documentId: row.document_id,
      errorMessage: row.error_message,
      kind: row.operation_kind as ProjectRelocationRecord['kind'],
      localProjectKey: row.local_project_key,
      operationId: row.operation_id,
      project,
      rename,
      sourceParentWitness,
      sourcePath: row.source_path,
      sourceSha256: row.source_sha256,
      sourceWitness,
      sourceWorkspaceId: row.source_workspace_id,
      state: row.state as ProjectRelocationRecord['state'],
      targetParentWitness,
      targetSha256: row.target_sha256,
      targetWitness,
      targetWorkspaceId: row.target_workspace_id,
    }
  } catch {
    throw invalid()
  }
}
function toRow(r: ProjectRelocationRecord, now: string): Insertable<DB['project_relocation']> {
  return {
    created_at: r.createdAt,
    destination_path: r.destinationPath,
    document_id: r.documentId,
    error_message: r.errorMessage,
    local_project_key: r.localProjectKey,
    operation_id: r.operationId,
    operation_kind: r.kind,
    project_json: JSON.stringify(r.project),
    rename_json: r.rename === null ? null : JSON.stringify(r.rename),
    source_parent_witness_json: JSON.stringify(r.sourceParentWitness),
    source_path: r.sourcePath,
    source_sha256: r.sourceSha256,
    source_witness_json: JSON.stringify(r.sourceWitness),
    source_workspace_id: r.sourceWorkspaceId,
    state: r.state,
    target_parent_witness_json: JSON.stringify(r.targetParentWitness),
    target_sha256: r.targetSha256,
    target_witness_json: r.targetWitness === null ? null : JSON.stringify(r.targetWitness),
    target_workspace_id: r.targetWorkspaceId,
    updated_at: now,
  }
}
function sameAuthority(a: ProjectRelocationRecord, b: ProjectRelocationRecord): boolean {
  return (
    JSON.stringify({
      ...a,
      errorMessage: null,
      state: 'planned',
      targetSha256: null,
      targetWitness: null,
    }) ===
    JSON.stringify({
      ...b,
      errorMessage: null,
      state: 'planned',
      targetSha256: null,
      targetWitness: null,
    })
  )
}
function fingerprint(w: FileWitness): string {
  return [w.dev, w.ino, w.size, w.mtimeNs, w.ctimeNs].join(':')
}
function regular(s: BigIntStats): boolean {
  return (
    s.isFile() &&
    !s.isSymbolicLink() &&
    s.nlink === 1n &&
    s.size > 0n &&
    s.size <= BigInt(Number.MAX_SAFE_INTEGER)
  )
}
function sameOriginal(s: BigIntStats | null, w: FileWitness): boolean {
  return !!s && regular(s) && fingerprint(witness(s)) === fingerprint(w)
}
function sameMoved(s: BigIntStats | null, w: FileWitness): boolean {
  return (
    !!s &&
    regular(s) &&
    s.dev.toString() === w.dev &&
    s.ino.toString() === w.ino &&
    s.size.toString() === w.size &&
    s.mtimeNs.toString() === w.mtimeNs
  )
}
function entryNow(p: string): BigIntStats | null {
  try {
    return lstatSync(p, { bigint: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw e
  }
}
function parentOf(p: string): ParentWitness {
  const s = lstatSync(p, { bigint: true })
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(p) !== p) {
    throw changed()
  }
  return { dev: s.dev.toString(), ino: s.ino.toString() }
}
function readableParent(p: string): ParentWitness {
  const result = parentOf(p)
  const s = lstatSync(p)
  if ((s.mode & 0o444) === 0 || (s.mode & 0o111) === 0) {
    throw changed()
  }
  accessSync(p, constants.R_OK | constants.X_OK)
  return result
}
function assertReadableParent(p: string, expected: ParentWitness): void {
  const current = readableParent(p)
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    throw changed()
  }
}
function sameParent(p: string, expected: ParentWitness): void {
  const current = parentOf(p)
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    throw changed()
  }
}
function assertParentsNow(a: string, aw: ParentWitness, b: string, bw: ParentWitness): void {
  sameParent(a, aw)
  sameParent(b, bw)
}
function assertNoCollision(p: string, allowedPath?: string): void {
  if (
    (p !== allowedPath && entryNow(p)) ||
    readdirSync(path.dirname(p)).some(
      (name) =>
        path.join(path.dirname(p), name) !== allowedPath &&
        name.toLowerCase() === path.basename(p).toLowerCase(),
    )
  ) {
    throw new ProjectRelocationStoreError(
      'PROJECT_MOVE_CONFLICT',
      'A file with this name already exists in the destination workspace. No file was replaced.',
    )
  }
}
async function hashChecked(
  p: string,
  expected: FileWitness,
  original: boolean,
  expectedHash?: string,
): Promise<string> {
  const handle = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !(original ? sameOriginal(before, expected) : sameMoved(before, expected)) ||
      realpathSync(p) !== p
    ) {
      throw changed()
    }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (!bytesRead) {
        break
      }
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const current = entryNow(p)
    if (
      fingerprint(witness(before)) !== fingerprint(witness(after)) ||
      !current ||
      fingerprint(witness(current)) !== fingerprint(witness(after))
    ) {
      throw changed()
    }
    const sha = hash.digest('hex')
    if (expectedHash && sha !== expectedHash) {
      throw changed()
    }
    return sha
  } finally {
    await handle.close()
  }
}
function renameCheckedNow(r: ProjectRelocationRecord): void {
  const parents = [path.dirname(r.sourcePath), path.dirname(r.destinationPath)]
  const fds: number[] = []
  try {
    for (const p of parents) {
      fds.push(openSync(p, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW))
    }
    for (let i = 0; i < fds.length; i++) {
      const s = fstatSync(fds[i], { bigint: true })
      const expected = i === 0 ? r.sourceParentWitness : r.targetParentWitness
      if (
        !s.isDirectory() ||
        s.dev.toString() !== expected.dev ||
        s.ino.toString() !== expected.ino
      ) {
        throw changed()
      }
    }
    assertParentsNow(parents[0], r.sourceParentWitness, parents[1], r.targetParentWitness)
    assertNoCollision(r.destinationPath, r.kind === 'rename' ? r.sourcePath : undefined)
    if (
      !sameOriginal(entryNow(r.sourcePath), r.sourceWitness) ||
      realpathSync(r.sourcePath) !== r.sourcePath
    ) {
      throw changed()
    }
    // No await/callback/log emission between final synchronous guards and same-filesystem rename.
    renameSync(r.sourcePath, r.destinationPath)
  } finally {
    for (const fd of fds) {
      closeSync(fd)
    }
  }
}
async function verifyRenamedPackage(
  r: ProjectRelocationRecord,
): Promise<{ sha256: string; witness: FileWitness }> {
  if (!r.rename || r.kind !== 'rename') {
    throw invalid()
  }
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  const current = entryNow(r.destinationPath)
  if (
    (r.sourcePath !== r.destinationPath && entryNow(r.sourcePath)) ||
    !current ||
    !regular(current) ||
    current.dev.toString() !== r.targetParentWitness.dev ||
    realpathSync(r.destinationPath) !== r.destinationPath
  ) {
    throw changed()
  }
  const expected = r.targetWitness ?? witness(current)
  const sha256 = await hashChecked(r.destinationPath, expected, true, r.targetSha256 ?? undefined)
  const portable = await readIgsPackage(r.destinationPath)
  const projectJson = await portable.readMember('project.json')
  if (
    !projectJson.equals(Buffer.from(r.rename.projectJson, 'utf8')) ||
    !isDeepStrictEqual(sortedMembers(portable.manifest.members), r.rename.members) ||
    !isDeepStrictEqual(portable.manifest.preview, r.rename.preview)
  ) {
    throw changed()
  }
  await hashChecked(r.destinationPath, expected, true, sha256)
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  if (r.sourcePath !== r.destinationPath && entryNow(r.sourcePath)) {
    throw changed()
  }
  return { sha256, witness: expected }
}
async function verifyCompleted(r: ProjectRelocationRecord): Promise<void> {
  if (r.kind === 'move') {
    await hashChecked(r.destinationPath, r.sourceWitness, false, r.sourceSha256)
  } else {
    if (!r.targetWitness || !r.targetSha256) {
      throw invalid()
    }
    await hashChecked(r.destinationPath, r.targetWitness, true, r.targetSha256)
  }
}
function completedWitnessNow(r: ProjectRelocationRecord): FileWitness {
  if (r.kind === 'move') {
    return movedWitnessNow(r)
  }
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  const current = entryNow(r.destinationPath)
  if (
    !r.targetWitness ||
    (r.sourcePath !== r.destinationPath && entryNow(r.sourcePath)) ||
    !sameOriginal(current, r.targetWitness) ||
    realpathSync(r.destinationPath) !== r.destinationPath
  ) {
    throw changed()
  }
  return witness(current!)
}
function movedWitnessNow(r: ProjectRelocationRecord): FileWitness {
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  if (entryNow(r.sourcePath)) {
    throw changed()
  }
  const moved = entryNow(r.destinationPath)
  if (!sameMoved(moved, r.sourceWitness) || realpathSync(r.destinationPath) !== r.destinationPath) {
    throw changed()
  }
  return witness(moved!)
}
function originalMetadataWitnessNow(r: ProjectRelocationRecord): FileWitness {
  if (r.sourcePath !== r.destinationPath) {
    return movedWitnessNow(r)
  }
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  const current = entryNow(r.destinationPath)
  if (
    !sameOriginal(current, r.sourceWitness) ||
    realpathSync(r.destinationPath) !== r.destinationPath
  ) {
    throw changed()
  }
  return witness(current!)
}
function syncCompletedNow(r: ProjectRelocationRecord): void {
  completedWitnessNow(r)
  const paths = [r.destinationPath, path.dirname(r.sourcePath), path.dirname(r.destinationPath)]
  for (const p of paths) {
    const fd = openSync(
      p,
      constants.O_RDONLY |
        constants.O_NOFOLLOW |
        (p === r.destinationPath ? 0 : constants.O_DIRECTORY),
    )
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
}
function invalid(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_INVALID',
    'The saved Move request could not be verified. No file was moved.',
  )
}
function changed(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_PENDING',
    'The Project file or a workspace changed. Move was retained for safe recovery; no replacement file will be moved.',
  )
}
function conflict(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_CONFLICT',
    'The Project or its Move state changed. Refresh Home before trying again.',
  )
}
