import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { readIgsPackage } from './igs-package.js'

/**
 * A clean document is not a durability proof. Reverify all saved members, exact document identity,
 * canonical file ownership and physical file/directory sync before releasing staging recovery.
 */
export async function proveAcceptedSavedPackage(input: {
  document: IgsProjectDocumentV1
  filePath: string
}): Promise<void> {
  const target = input.filePath
  const document = structuredClone(input.document)
  const before = await lstat(target, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || (await realpath(target)) !== target) {
    throw new Error('The saved Project path is not a canonical regular file.')
  }
  const archive = await readIgsPackage(target)
  if (!isDeepStrictEqual(archive.project, document)) {
    throw new Error('The saved Project document differs from the accepted document.')
  }
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!sameFileStat(before, await file.stat({ bigint: true }))) {
      throw new Error('The saved Project file changed during verification.')
    }
    await file.sync()
  } finally {
    await file.close()
  }
  const directory = await open(
    path.dirname(target),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
  if (!sameFileStat(before, await lstat(target, { bigint: true }))) {
    throw new Error('The saved Project file changed during verification.')
  }
}

function sameFileStat(a: BigIntStats, b: BigIntStats): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs &&
    a.mode === b.mode
  )
}
