import { type Kysely, sql } from 'kysely'

import type { DB } from '../db/database.types.js'

export const PROJECT_ARCHIVE_WITNESS_KEY = 'project-archive-witnesses-v1'

const maximumWitnesses = 512
const maximumValueLength = 36 * 1024
const sha256 = /^[a-f0-9]{64}$/

/** Optional validation history. Project metadata and accepted results still come from the archive. */
export class ProjectArchiveWitnesses {
  private dirty = false
  private loading: Promise<Set<string>> | undefined

  constructor(
    private readonly db: Kysely<DB>,
    private readonly validator: string,
  ) {}

  async contains(digest: string): Promise<boolean> {
    return (await this.digests()).has(digest)
  }

  async remember(digest: string): Promise<void> {
    const digests = await this.digests()
    if (digests.has(digest)) {
      return
    }
    if (digests.size === maximumWitnesses) {
      digests.delete(digests.values().next().value!)
    }
    digests.add(digest)
    this.dirty = true
  }

  async save(): Promise<void> {
    if (!this.dirty) {
      return
    }
    const digests = await this.digests()
    this.dirty = false
    const value = JSON.stringify({ sha256: [...digests], validator: this.validator })
    try {
      await this.db
        .insertInto('app_metadata')
        .values({ key: PROJECT_ARCHIVE_WITNESS_KEY, value })
        .onConflict((conflict) => conflict.column('key').doUpdateSet({ value }))
        .execute()
    } catch {
      // Losing validation history only makes a future scan validate the package again.
      this.dirty = true
    }
  }

  private digests(): Promise<Set<string>> {
    return (this.loading ??= this.load())
  }

  private async load(): Promise<Set<string>> {
    try {
      const row = await this.db
        .selectFrom('app_metadata')
        .select('value')
        .where('key', '=', PROJECT_ARCHIVE_WITNESS_KEY)
        .where(sql<number>`length(CAST(value AS BLOB))`, '<=', maximumValueLength)
        .executeTakeFirst()
      if (row) {
        const record = JSON.parse(row.value) as { sha256?: unknown; validator?: unknown } | null
        if (
          record?.validator === this.validator &&
          Object.keys(record).length === 2 &&
          Array.isArray(record.sha256) &&
          record.sha256.length <= maximumWitnesses &&
          record.sha256.every((entry) => typeof entry === 'string' && sha256.test(entry))
        ) {
          const digests = new Set<string>(record.sha256)
          if (digests.size === record.sha256.length) {
            return digests
          }
        }
      }
    } catch {
      // A lost or malformed cache must leave normal indexing available.
    }
    return new Set()
  }
}
