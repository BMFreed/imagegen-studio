import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { developmentImageWorkerLocation } from './development-image-worker.js'

test('the checkout image worker is reachable only by development or explicit smoke, never a package', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-dev-image-worker-'))
  try {
    const mainDirectory = path.join(root, 'dist', 'main')
    const executable = path.join(root, 'worker-python', '.venv', 'bin', 'python')
    const scratchDirectory = path.join(root, 'data', 'scratch')
    await mkdir(mainDirectory, { recursive: true })
    await mkdir(path.dirname(executable), { recursive: true })
    await writeFile(executable, '')
    const input = { mainDirectory, scratchDirectory, smokeOptIn: '1' }

    assert.equal(
      developmentImageWorkerLocation({ ...input, isPackaged: true, nodeEnv: 'development' }),
      null,
    )
    assert.equal(
      developmentImageWorkerLocation({ ...input, isPackaged: true, nodeEnv: 'test' }),
      null,
    )
    assert.equal(
      developmentImageWorkerLocation({ ...input, isPackaged: false, nodeEnv: 'production' }),
      null,
    )
    assert.equal(
      developmentImageWorkerLocation({
        ...input,
        isPackaged: false,
        nodeEnv: 'test',
        smokeOptIn: undefined,
      }),
      null,
    )

    const smoke = developmentImageWorkerLocation({ ...input, isPackaged: false, nodeEnv: 'test' })
    assert.equal(smoke?.pythonExecutable, executable)
    assert.equal(smoke?.stagingBasePath, scratchDirectory)
    assert.equal(smoke?.runtimeRoot, path.dirname(executable))
    assert.equal(
      developmentImageWorkerLocation({
        ...input,
        isPackaged: false,
        nodeEnv: 'development',
        smokeOptIn: undefined,
      })?.pythonExecutable,
      executable,
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
