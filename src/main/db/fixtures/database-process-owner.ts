import { sql } from 'kysely'

import { openAppDatabase } from '../database.js'

export type DatabaseOwnerRequest =
  { id: number; key: string; operation: 'write' } | { id: number; operation: 'close' | 'keys' }

export type DatabaseOwnerResponse =
  | { code: string; id: number; message: string; ok: false }
  | { id: 0; ready: true }
  | { id: number; keys?: string[]; ok: true }

const root = process.argv[2]
const migrations = process.argv[3]
if (!root || !migrations || !process.send) {
  throw new Error('Database owner fixture requires its storage roots and an IPC parent.')
}
const database = openAppDatabase(root, migrations)
// Refusal is observable without a five-second driver retry; this changes no lock semantics.
await sql`PRAGMA busy_timeout = 0`.execute(database.db)
process.send({ id: 0, ready: true } satisfies DatabaseOwnerResponse)

let operations = Promise.resolve()
process.on('message', (message: DatabaseOwnerRequest) => {
  operations = operations.then(async () => {
    try {
      if (message.operation === 'close') {
        await database.close()
        process.send?.({ id: message.id, ok: true } satisfies DatabaseOwnerResponse, () => {
          process.disconnect?.()
        })
      } else if (message.operation === 'write') {
        await database.db
          .insertInto('app_metadata')
          .values({ key: message.key, value: 'private durable probe' })
          .execute()
        process.send?.({ id: message.id, ok: true } satisfies DatabaseOwnerResponse)
      } else {
        const keys = await database.db
          .selectFrom('app_metadata')
          .select('key')
          .where('key', 'like', 'lock-visibility-%')
          .orderBy('key')
          .execute()
        process.send?.({
          id: message.id,
          keys: keys.map((row) => row.key),
          ok: true,
        } satisfies DatabaseOwnerResponse)
      }
    } catch (error) {
      process.send?.({
        code: (error as { code?: string }).code ?? 'UNKNOWN',
        id: message.id,
        message: error instanceof Error ? error.message : String(error),
        ok: false,
      } satisfies DatabaseOwnerResponse)
    }
  })
})
