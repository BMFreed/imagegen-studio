import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { verifyApplicationRelease } from '../src/main/application-updates/application-release.ts'
import {
  applicationReleaseArguments,
  inspectApplicationReleaseRuntimeDirectory,
} from './sign-application-release.mjs'

const args = [
  '--manifest',
  '/fixture/manifest.json',
  '--notes',
  '/fixture/notes.json',
  '--artifact',
  '/fixture/studio.AppImage',
  '--private-key',
  '/fixture/private.pem',
  '--key-id',
  'fixture-publisher',
  '--output',
  '/fixture/release.json',
]
const exec = promisify(execFile)
const compatibility = {
  cpuWorkerProtocolVersion: '1',
  databaseMigrations: [{ name: '0001_fixture.sql', sha256: 'a'.repeat(64) }],
  inferenceWorkerProtocolVersion: '1',
  projectSchemaVersion: 1,
}

async function fixture(operation) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-sign-app-release-'))
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const secret = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const artifactBytes = Buffer.from(
      'Synthetic AppImage fixture; deliberately not an executable.\n',
    )
    const releaseNotes = 'A plain release note from the publisher.'
    const files = {
      manifest: path.join(directory, 'manifest.json'),
      notes: path.join(directory, 'notes.json'),
      artifact: path.join(directory, 'studio.AppImage'),
      'private-key': path.join(directory, 'private.pem'),
      output: path.join(directory, 'release.json'),
    }
    const manifest = {
      appId: 'studio.imagegen.desktop',
      artifact: { filename: 'untrusted-template.AppImage', sha512: 'ignored', sizeBytes: 999 },
      compatibility: { ...compatibility, runtimeValidation: 'after-restart' },
      releaseId: 'fixture-release',
      releaseNotesSha256: '0'.repeat(64),
      schemaVersion: 1,
      scope: 'application-release',
      target: { arch: 'x64', format: 'AppImage', os: 'linux' },
      version: '0.2.0',
    }
    await fs.writeFile(files.manifest, JSON.stringify(manifest))
    await fs.writeFile(files.notes, JSON.stringify(releaseNotes))
    await fs.writeFile(files.artifact, artifactBytes, { mode: 0o644 })
    await fs.writeFile(files['private-key'], secret, { mode: 0o600 })
    const actualArgs = args.map((value) => {
      const name = Object.keys(files).find(
        (name) => value === `/fixture/${path.basename(files[name])}`,
      )
      return name ? files[name] : value
    })
    await operation({
      actualArgs,
      artifactBytes,
      directory,
      files,
      manifest,
      publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      releaseNotes,
      secret,
    })
  } finally {
    await fs.rm(directory, { force: true, recursive: true })
  }
}

async function runtimeFixture(operation) {
  await fixture(async (value) => {
    const runtimeDirectory = path.join(value.directory, 'final-app')
    const archive = path.join(runtimeDirectory, 'resources/app.asar')
    const executable = path.join(runtimeDirectory, 'imagegen-studio')
    const archiveBytes = Buffer.from('Owned final archive bytes; no container inspection.')
    const executableBytes = Buffer.from('Owned post-build executable bytes; not a running binary.')
    await fs.mkdir(path.dirname(archive), { recursive: true })
    await fs.writeFile(archive, archiveBytes, { mode: 0o664 })
    await fs.writeFile(executable, executableBytes, { mode: 0o755 })
    await fs.writeFile(
      value.files.manifest,
      JSON.stringify({
        ...value.manifest,
        schemaVersion: 2,
        runtimeFiles: {
          archive: { sha512: 'ignored template archive', sizeBytes: 1 },
          executable: { sha512: 'ignored template executable', sizeBytes: 1 },
        },
      }),
    )
    await operation({
      ...value,
      archive,
      archiveBytes,
      executable,
      executableBytes,
      runtimeDirectory,
      actualArgs: [...value.actualArgs, '--runtime-directory', runtimeDirectory],
    })
  })
}

function cli(actualArgs) {
  return exec(
    process.execPath,
    ['--import', 'tsx', 'scripts/sign-application-release.mjs', ...actualArgs],
    { timeout: 10_000, maxBuffer: 64 * 1024 },
  )
}

async function refuses(actualArgs, secret) {
  const result = await cli(actualArgs).then(
    () => assert.fail('Invalid or unsafe release production must refuse.'),
    (error) => error,
  )
  assert.equal(result.code, 1)
  assert.equal(result.stdout, '')
  assert.deepEqual(JSON.parse(result.stderr), {
    outcome: 'FAIL',
    code: 'APPLICATION_RELEASE_SIGN_FAILED',
    message: 'The application release could not be signed.',
  })
  assert.equal(result.stderr.includes(secret), false)
  assert.equal(result.stderr.includes('BEGIN PRIVATE KEY'), false)
}

test('application release CLI requires notes, identity and canonical explicit local paths', () => {
  assert.equal(applicationReleaseArguments(args)['key-id'], 'fixture-publisher')
  assert.equal(
    applicationReleaseArguments([...args, '--runtime-directory', '/fixture/final-app'])[
      'runtime-directory'
    ],
    '/fixture/final-app',
  )
  for (const invalid of [
    args.filter((value, index) => index !== 2 && index !== 3),
    args.slice(0, -2),
    [...args, '--unknown', 'x'],
    [...args, '--private-key', '/second'],
    args.map((value) => (value === '/fixture/private.pem' ? 'relative/private.pem' : value)),
    args.map((value) => (value === '/fixture/notes.json' ? '/fixture/../notes.json' : value)),
    [...args, '--runtime-directory', 'relative/app'],
    [...args, '--runtime-directory', '/fixture/../app'],
    [...args, '--runtime-directory', '/fixture/app', '--runtime-directory', '/fixture/app'],
  ]) {
    assert.throws(() => applicationReleaseArguments(invalid))
  }
})

test('real CLI signs actual artifact and notes for the public verifier without claiming package readiness', async () => {
  await fixture(
    async ({ actualArgs, artifactBytes, directory, files, publicKey, releaseNotes, secret }) => {
      const parentMode = (await fs.stat(directory)).mode
      const result = await cli(actualArgs)
      assert.equal(result.stderr, '')
      const receipt = JSON.parse(result.stdout)
      assert.equal(receipt.outcome, 'PASS')
      assert.equal(receipt.installed, false)
      assert.equal(receipt.packageFormatVerified, false)
      assert.equal(receipt.runtimeFilesDeclared, false)
      assert.equal(receipt.containerContentsVerified, false)
      assert.equal(result.stdout.includes(secret), false)
      const envelope = await fs.readFile(files.output)
      assert.deepEqual(Object.keys(JSON.parse(envelope)).sort(), [
        'keyId',
        'payload',
        'schemaVersion',
        'signature',
      ])
      const selected = {
        filename: path.basename(files.artifact),
        sha512: createHash('sha512').update(artifactBytes).digest('base64'),
        sizeBytes: artifactBytes.length,
        version: '0.2.0',
      }
      const verified = verifyApplicationRelease(
        envelope,
        { trustedKeys: { 'fixture-publisher': publicKey }, compatibility },
        selected,
        releaseNotes,
      )
      assert.deepEqual(verified.artifact, receipt.artifact)
      assert.equal(verified.artifact.filename, 'studio.AppImage')
      assert.equal(verified.artifact.sizeBytes, artifactBytes.length)
      assert.equal(verified.artifact.sha512, selected.sha512)
      assert.equal(verified.compatibility.runtimeValidation, 'after-restart')
      assert.equal((await fs.stat(files.output)).mode & 0o777, 0o600)
      assert.equal((await fs.stat(directory)).mode, parentMode)
      assert.deepEqual(await fs.readFile(files.artifact), artifactBytes)
      assert.equal(await fs.readFile(files['private-key'], 'utf8'), secret)
      assert.throws(() =>
        verifyApplicationRelease(
          envelope,
          { trustedKeys: { 'fixture-publisher': publicKey }, compatibility },
          selected,
          'Different notes',
        ),
      )
    },
  )
})

test('real v2 CLI signs actual final role files as publisher declarations, without container proof', async () => {
  await runtimeFixture(
    async ({
      actualArgs,
      files,
      publicKey,
      releaseNotes,
      archiveBytes,
      executableBytes,
      artifactBytes,
    }) => {
      const result = await cli(actualArgs)
      assert.equal(result.stderr, '')
      const receipt = JSON.parse(result.stdout)
      assert.equal(receipt.runtimeFilesDeclared, true)
      assert.equal(receipt.containerContentsVerified, false)
      assert.equal(receipt.packageFormatVerified, false)
      assert.equal(receipt.installed, false)
      const selected = {
        filename: path.basename(files.artifact),
        sha512: createHash('sha512').update(artifactBytes).digest('base64'),
        sizeBytes: artifactBytes.length,
        version: '0.2.0',
      }
      const verified = verifyApplicationRelease(
        await fs.readFile(files.output),
        { trustedKeys: { 'fixture-publisher': publicKey }, compatibility },
        selected,
        releaseNotes,
      )
      assert.equal(verified.schemaVersion, 2)
      assert.deepEqual(verified.runtimeFiles, {
        archive: {
          sha512: createHash('sha512').update(archiveBytes).digest('base64'),
          sizeBytes: archiveBytes.length,
        },
        executable: {
          sha512: createHash('sha512').update(executableBytes).digest('base64'),
          sizeBytes: executableBytes.length,
        },
      })
      assert.deepEqual(await fs.readFile(files.artifact), artifactBytes)
    },
  )
})

test('real CLI requires the final runtime directory exactly for v2 and preserves v1 refusal of extensions', async (t) => {
  await t.test('v2 without explicit directory', async () => {
    await runtimeFixture(async ({ actualArgs, files, secret }) => {
      await refuses(actualArgs.slice(0, -2), secret)
      await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
    })
  })
  await t.test('v1 with directory', async () => {
    await fixture(async ({ actualArgs, directory, files, secret }) => {
      await refuses([...actualArgs, '--runtime-directory', directory], secret)
      await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
    })
  })
  await t.test('v1 with unsigned runtime extension', async () => {
    await fixture(async ({ actualArgs, files, manifest, secret }) => {
      await fs.writeFile(files.manifest, JSON.stringify({ ...manifest, runtimeFiles: {} }))
      await refuses(actualArgs, secret)
      await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
    })
  })
})

test('v2 publisher refuses missing, empty, nonregular or symlinked fixed runtime inputs', async (t) => {
  for (const role of ['archive', 'executable']) {
    for (const kind of ['missing', 'empty', 'directory', 'symlink']) {
      await t.test(`${role}: ${kind}`, async () => {
        await runtimeFixture(async (value) => {
          const filename = value[role]
          await fs.unlink(filename)
          if (kind === 'empty') await fs.writeFile(filename, '')
          if (kind === 'directory') await fs.mkdir(filename)
          if (kind === 'symlink') await fs.symlink(value.files.artifact, filename)
          await refuses(value.actualArgs, value.secret)
          await assert.rejects(fs.lstat(value.files.output), { code: 'ENOENT' })
        })
      })
    }
  }
  for (const member of ['runtime', 'resources']) {
    await t.test(`${member} symlink`, async () => {
      await runtimeFixture(async (value) => {
        const filename =
          member === 'runtime'
            ? value.runtimeDirectory
            : path.join(value.runtimeDirectory, 'resources')
        await fs.rename(filename, filename + '-retained')
        await fs.symlink(filename + '-retained', filename)
        await refuses(value.actualArgs, value.secret)
        await assert.rejects(fs.lstat(value.files.output), { code: 'ENOENT' })
      })
    })
  }
})

test('held publisher runtime inputs refuse same-byte inode replacement and parent replacement', async (t) => {
  for (const kind of ['archive', 'executable', 'resources', 'runtime']) {
    await t.test(kind, async () => {
      await runtimeFixture(async (value) => {
        const captured = await inspectApplicationReleaseRuntimeDirectory(value.runtimeDirectory)
        try {
          await captured.unchanged()
          const filename =
            kind === 'runtime'
              ? value.runtimeDirectory
              : kind === 'resources'
                ? path.join(value.runtimeDirectory, 'resources')
                : value[kind]
          const retained = filename + '-retained'
          await fs.rename(filename, retained)
          if (kind === 'archive' || kind === 'executable') {
            await fs.copyFile(retained, filename)
            assert.deepEqual(await fs.readFile(filename), await fs.readFile(retained))
          } else {
            await fs.cp(retained, filename, { recursive: true })
          }
          await assert.rejects(captured.unchanged(), /changed/)
        } finally {
          await captured.close()
        }
      })
    })
  }
})

test('real CLI refuses an existing output without replacing its bytes', async () => {
  await fixture(async ({ actualArgs, files, secret }) => {
    const existing = Buffer.from('Existing release must survive.\n')
    await fs.writeFile(files.output, existing)
    await refuses(actualArgs, secret)
    assert.deepEqual(await fs.readFile(files.output), existing)
  })
})

test('real CLI refuses a non-Ed25519 private key without publishing or exposing it', async () => {
  await fixture(async ({ actualArgs, files }) => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const secret = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    await fs.writeFile(files['private-key'], secret, { mode: 0o600 })
    await refuses(actualArgs, secret)
    await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
  })
})

test('real CLI refuses symlinked inputs and output parents without publishing', async (t) => {
  for (const input of ['manifest', 'notes', 'artifact', 'private-key']) {
    await t.test(input, async () => {
      await fixture(async ({ actualArgs, directory, files, secret }) => {
        const link = path.join(directory, `linked-${path.basename(files[input])}`)
        await fs.symlink(files[input], link)
        await refuses(
          actualArgs.map((value) => (value === files[input] ? link : value)),
          secret,
        )
        await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
      })
    })
  }
  await t.test('output parent', async () => {
    await fixture(async ({ actualArgs, directory, files, secret }) => {
      const parent = path.join(directory, 'real-parent')
      const link = path.join(directory, 'linked-parent')
      await fs.mkdir(parent)
      await fs.symlink(parent, link)
      const linkedOutput = path.join(link, 'release.json')
      await refuses(
        actualArgs.map((value) => (value === files.output ? linkedOutput : value)),
        secret,
      )
      assert.deepEqual(await fs.readdir(parent), [])
    })
  })
})

test('real CLI rejects invalid release declarations before creating output', async () => {
  await fixture(async ({ actualArgs, files, manifest, secret }) => {
    await fs.writeFile(
      files.manifest,
      JSON.stringify({
        ...manifest,
        compatibility: { ...manifest.compatibility, runtimeValidation: 'ready' },
      }),
    )
    await refuses(actualArgs, secret)
    await assert.rejects(fs.lstat(files.output), { code: 'ENOENT' })
  })
})
