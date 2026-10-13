import type {
  PresetDefinition,
  PresetRecord,
  PresetWorkflow,
} from '../../shared/presets/preset-schema.js'
import { isPresetRecord, parsePresetDefinition } from '../../shared/presets/preset-schema.js'

import type { Kysely, Selectable, Transaction } from 'kysely'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { DB } from '../db/database.types.js'

/** The product's fixed elapsed-time recovery window, independent of local DST. */
export const PRESET_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

type PresetRow = Selectable<DB['presets']>
type PresetDatabase = Kysely<DB> | Transaction<DB>
type RepositoryOptions = { id?: () => string; now?: () => Date }
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export class PresetRepositoryError extends Error {
  constructor(
    readonly code:
      | 'PRESET_CONFLICT'
      | 'PRESET_DELETED'
      | 'PRESET_EXPIRED'
      | 'PRESET_INPUT_INVALID'
      | 'PRESET_NOT_DELETED'
      | 'PRESET_NOT_FOUND'
      | 'PRESET_STORAGE_FAILED'
      | 'PRESET_STORAGE_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'PresetRepositoryError'
  }
}

/** Main-owned storage only. Resource availability and Project Apply are separate owners. */
export class PresetRepository {
  private readonly id: () => string
  private readonly now: () => Date

  constructor(
    private readonly database: Kysely<DB>,
    options: RepositoryOptions = {},
  ) {
    this.id = options.id ?? randomUUID
    this.now = options.now ?? (() => new Date())
  }

  async create(input: unknown): Promise<PresetRecord> {
    const definition = captureDefinition(input)
    const id = this.captureId()
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const result = await transaction
          .insertInto('presets')
          .values({
            ...definitionColumns(definition),
            created_at: timestamp.iso,
            deleted_at: null,
            id,
            updated_at: timestamp.iso,
          })
          .onConflict((conflict) => conflict.column('id').doNothing())
          .executeTakeFirst()
        if (result.numInsertedOrUpdatedRows !== 1n) {
          throw conflict()
        }
        return mapStoredRow(await requireRow(transaction, id))
      }),
    )
  }

  async duplicate(id: string, name?: string): Promise<PresetRecord> {
    requireId(id)
    if (name !== undefined && typeof name !== 'string') {
      throw inputInvalid()
    }
    const duplicateId = this.captureId()
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const original = mapStoredRow(await requireRow(transaction, id))
        requireActive(original)
        const definition = captureDefinition({
          description: original.description,
          favorite: original.favorite,
          name: name ?? `${original.name} (copy)`,
          payload: original.payload,
          tags: original.tags,
          workflow: original.workflow,
        })
        const result = await transaction
          .insertInto('presets')
          .values({
            ...definitionColumns(definition),
            created_at: timestamp.iso,
            deleted_at: null,
            id: duplicateId,
            updated_at: timestamp.iso,
          })
          .onConflict((conflict) => conflict.column('id').doNothing())
          .executeTakeFirst()
        if (result.numInsertedOrUpdatedRows !== 1n) {
          throw conflict()
        }
        return mapStoredRow(await requireRow(transaction, duplicateId))
      }),
    )
  }

  async get(id: string, options: { includeDeleted?: boolean } = {}): Promise<PresetRecord | null> {
    requireId(id)
    return storageOperation(async () => {
      const row = await this.database
        .selectFrom('presets')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (!row) {
        return null
      }
      const record = mapStoredRow(row)
      return record.deletedAt !== null && !options.includeDeleted ? null : record
    })
  }

  async list(options: { deleted?: boolean } = {}): Promise<PresetRecord[]> {
    return storageOperation(async () => {
      const rows = await this.database
        .selectFrom('presets')
        .selectAll()
        .where('deleted_at', options.deleted ? 'is not' : 'is', null)
        .orderBy('updated_at', 'desc')
        .orderBy('name')
        .orderBy('id')
        .execute()
      return rows.map(mapStoredRow)
    })
  }

  async purgeExpired(): Promise<number> {
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const rows = await transaction
          .selectFrom('presets')
          .selectAll()
          .where('deleted_at', 'is not', null)
          .orderBy('id')
          .execute()
        // Validate the entire set before deleting anything. Corrupt timestamps or JSON are
        // never interpreted as expiry and never silently erased by an automatic cleanup.
        const expired = rows.filter((row) => {
          const record = mapStoredRow(row)
          return record.expiresAt !== null && timestamp.epoch >= parseUtc(record.expiresAt)
        })
        for (const row of expired) {
          const result = await transaction
            .deleteFrom('presets')
            .where('id', '=', row.id)
            .where('deleted_at', '=', row.deleted_at)
            .where('updated_at', '=', row.updated_at)
            .executeTakeFirst()
          if (result.numDeletedRows !== 1n) {
            throw conflict()
          }
        }
        return expired.length
      }),
    )
  }

  async restore(id: string): Promise<PresetRecord> {
    requireId(id)
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const row = await requireRow(transaction, id)
        const record = mapStoredRow(row)
        if (record.deletedAt === null || record.expiresAt === null) {
          throw new PresetRepositoryError('PRESET_NOT_DELETED', 'This preset is already active.')
        }
        if (timestamp.epoch >= parseUtc(record.expiresAt)) {
          throw new PresetRepositoryError(
            'PRESET_EXPIRED',
            'This preset has passed its recovery deadline.',
          )
        }
        const result = await transaction
          .updateTable('presets')
          .set({ deleted_at: null, updated_at: timestamp.iso })
          .where('id', '=', id)
          .where('deleted_at', '=', row.deleted_at)
          .where('updated_at', '=', row.updated_at)
          .executeTakeFirst()
        if (result.numUpdatedRows !== 1n) {
          throw conflict()
        }
        return mapStoredRow(await requireRow(transaction, id))
      }),
    )
  }

  async softDelete(id: string): Promise<PresetRecord> {
    requireId(id)
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const row = await requireRow(transaction, id)
        const record = mapStoredRow(row)
        if (record.deletedAt !== null) {
          // Repeated Delete must never extend the original 30-day recovery window.
          return record
        }
        const result = await transaction
          .updateTable('presets')
          .set({ deleted_at: timestamp.iso, updated_at: timestamp.iso })
          .where('id', '=', id)
          .where('deleted_at', 'is', null)
          .where('updated_at', '=', row.updated_at)
          .executeTakeFirst()
        if (result.numUpdatedRows !== 1n) {
          throw conflict()
        }
        return mapStoredRow(await requireRow(transaction, id))
      }),
    )
  }

  /** Complete explicit definition replacement; missing sections remain missing. */
  async update(id: string, input: unknown): Promise<PresetRecord> {
    requireId(id)
    const definition = captureDefinition(input)
    const timestamp = this.captureTime()
    return storageOperation(async () =>
      this.database.transaction().execute(async (transaction) => {
        const row = await requireRow(transaction, id)
        requireActive(mapStoredRow(row))
        const result = await transaction
          .updateTable('presets')
          .set({ ...definitionColumns(definition), updated_at: timestamp.iso })
          .where('id', '=', id)
          .where('deleted_at', 'is', null)
          .where('updated_at', '=', row.updated_at)
          .executeTakeFirst()
        if (result.numUpdatedRows !== 1n) {
          throw conflict()
        }
        return mapStoredRow(await requireRow(transaction, id))
      }),
    )
  }

  private captureId(): string {
    try {
      return requireId(this.id())
    } catch {
      throw inputInvalid()
    }
  }

  private captureTime(): { epoch: number; iso: string } {
    try {
      const now = this.now()
      const iso = now.toISOString()
      const epoch = parseUtc(iso)
      if (!Number.isSafeInteger(epoch + PRESET_RETENTION_MS)) {
        throw inputInvalid()
      }
      parseUtc(new Date(epoch + PRESET_RETENTION_MS).toISOString())
      return { epoch, iso }
    } catch {
      throw inputInvalid()
    }
  }
}

function definitionColumns(definition: PresetDefinition) {
  return {
    description: definition.description || null,
    favorite: definition.favorite ? 1 : 0,
    name: definition.name,
    payload_json: JSON.stringify(definition.payload),
    tags_json: JSON.stringify(definition.tags),
    workflow_type: workflowToStorage(definition.workflow),
  }
}

function workflowToStorage(workflow: PresetWorkflow): string {
  switch (workflow) {
    case 'imageToImage': {
      return 'img2img'
    }
    case 'smartPatch': {
      return 'inpaint'
    }
    case 'textToImage': {
      return 'txt2img'
    }
  }
}

function workflowFromStorage(workflow: string): PresetWorkflow {
  switch (workflow) {
    case 'img2img': {
      return 'imageToImage'
    }
    case 'inpaint': {
      return 'smartPatch'
    }
    case 'txt2img': {
      return 'textToImage'
    }
    default: {
      throw storageInvalid()
    }
  }
}

function captureDefinition(input: unknown): PresetDefinition {
  try {
    return parsePresetDefinition(structuredClone(input))
  } catch {
    throw inputInvalid()
  }
}

function mapStoredRow(row: PresetRow): PresetRecord {
  try {
    requireId(row.id)
    parseUtc(row.created_at)
    parseUtc(row.updated_at)
    if (row.favorite !== 0 && row.favorite !== 1) {
      throw storageInvalid()
    }
    const rawDefinition = {
      description: row.description ?? '',
      favorite: row.favorite === 1,
      name: row.name,
      payload: JSON.parse(row.payload_json) as unknown,
      tags: JSON.parse(row.tags_json) as unknown,
      workflow: workflowFromStorage(row.workflow_type),
    }
    const definition = parsePresetDefinition(rawDefinition)
    if (!isDeepStrictEqual(definition, rawDefinition)) {
      throw storageInvalid()
    }
    const deletedAt = row.deleted_at
    const expiresAt =
      deletedAt === null ? null : new Date(parseUtc(deletedAt) + PRESET_RETENTION_MS).toISOString()
    const record = { ...definition, deletedAt, expiresAt, id: row.id, updatedAt: row.updated_at }
    if (!isPresetRecord(record)) {
      throw storageInvalid()
    }
    return record
  } catch {
    throw storageInvalid()
  }
}

function parseUtc(value: string): number {
  if (typeof value !== 'string' || !UTC_PATTERN.test(value)) {
    throw storageInvalid()
  }
  const epoch = Date.parse(value)
  if (!Number.isSafeInteger(epoch) || new Date(epoch).toISOString() !== value) {
    throw storageInvalid()
  }
  return epoch
}

function requireId(value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw inputInvalid()
  }
  return value
}

function requireActive(record: PresetRecord): void {
  if (record.deletedAt !== null) {
    throw new PresetRepositoryError(
      'PRESET_DELETED',
      'This preset is deleted. Restore it before editing.',
    )
  }
}

async function requireRow(database: PresetDatabase, id: string): Promise<PresetRow> {
  const row = await database
    .selectFrom('presets')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!row) {
    throw new PresetRepositoryError('PRESET_NOT_FOUND', 'This preset is no longer available.')
  }
  return row
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PresetRepositoryError) {
      throw error
    }
    throw new PresetRepositoryError(
      'PRESET_STORAGE_FAILED',
      'The preset could not be stored or read. Try again.',
    )
  }
}

function inputInvalid(): PresetRepositoryError {
  return new PresetRepositoryError(
    'PRESET_INPUT_INVALID',
    'The preset definition or request is invalid.',
  )
}

function storageInvalid(): PresetRepositoryError {
  return new PresetRepositoryError(
    'PRESET_STORAGE_INVALID',
    'Stored preset data is invalid. It has been preserved.',
  )
}

function conflict(): PresetRepositoryError {
  return new PresetRepositoryError(
    'PRESET_CONFLICT',
    'The preset changed before this action completed. Refresh and try again.',
  )
}
