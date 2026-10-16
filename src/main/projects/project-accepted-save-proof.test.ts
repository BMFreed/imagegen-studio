import { IGS_MIMETYPE } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import test from 'node:test'
import * as yazl from 'yazl'

import { readIgsPackage } from './igs-package.js'
import { proveAcceptedSavedPackage } from './project-accepted-save-proof.js'
import { ProjectSession } from './project-session.js'

async function withSavedProject(
  run: (session: ProjectSession, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-accepted-save-proof-'))
  try {
    const session = await ProjectSession.create(path.join(root, 'Project.igs'), 'Saved proof', {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    })
    await run(session, root)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('accepted Save proof qualifies an exact real package and captures caller identity before awaits', async () => {
  await withSavedProject(async (session, root) => {
    await proveAcceptedSavedPackage(session)
    const caller = { document: structuredClone(session.document), filePath: session.filePath }
    const captured = proveAcceptedSavedPackage(caller)
    caller.document.title = 'Caller mutation after proof started'
    caller.filePath = path.join(root, 'Missing.igs')
    await captured
  })
})

test('accepted Save proof rejects a different document or noncanonical symlink file', async () => {
  await withSavedProject(async (session, root) => {
    await assert.rejects(
      proveAcceptedSavedPackage({
        document: { ...session.document, title: 'Unsaved different document' },
        filePath: session.filePath,
      }),
      /document differs/,
    )
    const linked = path.join(root, 'Linked.igs')
    await symlink(session.filePath, linked)
    await assert.rejects(
      proveAcceptedSavedPackage({ document: session.document, filePath: linked }),
      /canonical regular file/,
    )
  })
})

test('accepted Save proof rejects corrupted actual image bytes even with valid Project JSON and ZIP', async () => {
  await withSavedProject(async (session, root) => {
    const archive = await readIgsPackage(session.filePath)
    const damagedPath = path.join(root, 'Damaged.igs')
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from(IGS_MIMETYPE), 'mimetype', { compress: false })
    zip.addBuffer(Buffer.from(JSON.stringify(archive.manifest)), 'manifest.json', {
      compress: false,
    })
    for (const member of archive.manifest.members) {
      const bytes = Buffer.from(await archive.readMember(member.path))
      if (member.path === 'preview/merged.png') {
        bytes[bytes.length - 1] ^= 1
      }
      zip.addBuffer(bytes, member.path, { compress: false })
    }
    zip.end()
    await pipeline(zip.outputStream, createWriteStream(damagedPath))
    await assert.rejects(
      proveAcceptedSavedPackage({ document: session.document, filePath: damagedPath }),
      'Valid Project JSON cannot qualify a package with corrupted image bytes.',
    )
  })
})
