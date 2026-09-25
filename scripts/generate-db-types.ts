import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../src/main/db/database.js'

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-schema-'))
try {
  const appDb = openAppDatabase(tempRoot, path.resolve('src/main/db/migrations'))
  await appDb.close()
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'kysely-codegen',
      '--dialect',
      'sqlite',
      '--url',
      appDb.filePath,
      '--out-file',
      'src/main/db/database.types.ts',
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
  } else {
    // Codegen's defaults differ from the repository formatter. Keep regeneration lint-clean.
    const formatted = spawnSync(
      'pnpm',
      ['exec', 'prettier', '--write', 'src/main/db/database.types.ts'],
      { stdio: 'inherit' },
    )
    if (formatted.status !== 0) {
      process.exitCode = formatted.status ?? 1
    }
  }
} finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
