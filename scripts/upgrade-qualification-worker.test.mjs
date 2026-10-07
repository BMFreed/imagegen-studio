/**
 * Boundary: real owned filesystem/report/rollback orchestration with controlled inspection, uv
 * commands, worker readiness/exit and proc/cgroup reads; no real installer or ML in this suite.
 * Invariant: package-only upgrade activates only after verified ready/exit; failures preserve
 * historical evidence and restore bytes. Neighbor: same fixture with a stale manifest, changed
 * dependency, missing capability or unconfirmed exit. Removing one equality, exit or publication
 * fence must make the corresponding preservation assertion fail.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  argumentsFor,
  assertRuntimeIdle,
  assertUpgradeBounds,
  readUpgradeOptionsFile,
  systemdDeadlineSeconds,
  treeManifest,
  upgradeQualificationWorker,
} from './upgrade-qualification-worker.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const originalReady = {
  capabilities: [
    'illustrious-txt2img',
    'target-composition',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
  ],
  protocolVersion: '1',
  pythonVersion: '3.12.13',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.12.0',
}
const newReady = {
  ...originalReady,
  capabilities: [...originalReady.capabilities, 'illustrious-euler', 'illustrious-noise-profile'],
  workerVersion: '0.14.0',
}

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-worker-upgrade-'))
  const appData = path.join(root, 'data')
  const repository = path.join(root, 'repository')
  const runtimeId = 'controlled-installed'
  const environmentRoot = path.join(appData, 'runtime', 'environments', runtimeId)
  const ownedPython = path.join(appData, 'runtime', 'python', `${runtimeId}-cpython-3.12.13`)
  const workerRoot = path.join(
    environmentRoot,
    'lib',
    'python3.12',
    'site-packages',
    'imagegen_worker',
  )
  const distInfoRoot = path.join(path.dirname(workerRoot), 'imagegen_worker-0.1.0.dist-info')
  const pythonExecutable = path.join(environmentRoot, 'bin', 'python')
  const project = path.join(repository, 'worker-python')
  const report = path.join(root, 'upgrade-report.json')
  const historicalReport = path.join(root, 'provision-report.json')
  const uv = path.join(root, 'uv')
  try {
    for (const directory of [
      workerRoot,
      distInfoRoot,
      path.join(environmentRoot, 'bin'),
      path.join(ownedPython, 'bin'),
      path.join(appData, 'cache', 'runtime-downloads'),
      path.join(appData, 'logs'),
      path.join(environmentRoot, 'resources', 'sdxl-config'),
      path.join(project, 'src', 'imagegen_worker'),
    ]) {
      await fs.mkdir(directory, { recursive: true })
    }
    await fs.writeFile(uv, 'controlled uv, never executed\n', { mode: 0o700 })
    await fs.writeFile(
      path.join(ownedPython, 'bin', 'python3.12'),
      'controlled owned interpreter\n',
      { mode: 0o700 },
    )
    await fs.symlink(path.join(ownedPython, 'bin', 'python3.12'), pythonExecutable)
    await fs.writeFile(
      path.join(environmentRoot, 'bin', 'imagegen-worker'),
      'original launcher\n',
      { mode: 0o700 },
    )
    await fs.writeFile(path.join(workerRoot, '__init__.py'), 'ORIGINAL = True\n')
    await fs.writeFile(
      path.join(workerRoot, 'inference.py'),
      'INFERENCE_WORKER_VERSION = "0.12.0"\n',
    )
    await fs.writeFile(
      path.join(distInfoRoot, 'METADATA'),
      'Name: imagegen-worker\nVersion: 0.1.0\n',
    )
    await fs.writeFile(path.join(distInfoRoot, 'RECORD'), 'original bounded record\n')
    await fs.writeFile(
      path.join(project, 'src', 'imagegen_worker', '__init__.py'),
      'UPGRADED = True\n',
    )
    await fs.writeFile(
      path.join(project, 'src', 'imagegen_worker', 'inference.py'),
      'INFERENCE_WORKER_VERSION = "0.14.0"\n',
    )
    await fs.writeFile(
      path.join(project, 'pyproject.toml'),
      '[project]\nname = "imagegen-worker"\nversion = "0.1.0"\n',
    )
    await fs.writeFile(path.join(project, 'uv.lock'), 'controlled identical locked dependencies\n')
    await fs.writeFile(
      path.join(environmentRoot, 'resources', 'sdxl-config', 'config.json'),
      '{"pinned":true}\n',
    )
    const packages = { 'imagegen-worker': '0.1.0', pillow: '12.2.0', torch: '2.7.1' }
    const inspection = async () => ({
      pythonVersion: '3.12.13',
      prefix: environmentRoot,
      basePrefix: ownedPython,
      workerRoot,
      distInfoRoot,
      editable: false,
      packages: { ...packages },
      workerFiles: await treeManifest(workerRoot),
      recordPaths: [
        'imagegen_worker/__init__.py',
        'imagegen_worker/inference.py',
        'imagegen_worker-0.1.0.dist-info/METADATA',
        'imagegen_worker-0.1.0.dist-info/RECORD',
        '../../../bin/imagegen-worker',
      ],
    })
    const previous = {
      status: 'activated-qualified',
      appData,
      runtimeId,
      pythonExecutable,
      confirmedWorkerExit: true,
      ready: originalReady,
      inputs: {
        python: { files: await treeManifest(ownedPython, { python: true }) },
        config: {
          files: await treeManifest(path.join(environmentRoot, 'resources', 'sdxl-config')),
        },
        worker: {
          files: await treeManifest(workerRoot),
          pyprojectSha256: digest(await fs.readFile(path.join(project, 'pyproject.toml'))),
          lockSha256: digest(await fs.readFile(path.join(project, 'uv.lock'))),
        },
        uv: { executable: uv, sha256: digest(await fs.readFile(uv)) },
      },
      installed: await inspection(),
    }
    await fs.writeFile(historicalReport, `${JSON.stringify(previous, null, 2)}\n`)
    const metadata = {
      status: 'passed',
      appData,
      runtimeId,
      report: historicalReport,
      pythonExecutable,
      confirmedWorkerExit: true,
    }
    const metadataPath = path.join(appData, 'qualification-runtime.json')
    const pointerPath = path.join(appData, 'runtime', 'current-runtime.json')
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600 })
    await fs.writeFile(
      pointerPath,
      `${JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable })}\n`,
    )
    const original = {
      metadata: await fs.readFile(metadataPath),
      pointer: await fs.readFile(pointerPath),
      report: await fs.readFile(historicalReport),
      worker: await treeManifest(workerRoot, { bytecode: true, modes: true }),
      distribution: await treeManifest(distInfoRoot, { bytecode: true, modes: true }),
      launcher: await fs.readFile(path.join(environmentRoot, 'bin', 'imagegen-worker')),
    }
    const commands = []
    let installed = false
    const dependencies = {
      artifactRoot: root,
      repository,
      inspect: inspection,
      assertBounds: async () => ({
        group: '/controlled.service',
        memoryMax: '12884901888',
        swapMax: '0',
        runtimeMaxSeconds: 600,
      }),
      assertIdle: async () => ({ noLiveRuntimeUsers: true }),
      runCommand: async (_executable, argv, cwd) => {
        commands.push(argv)
        if (argv[0] === 'build') {
          await fs.writeFile(
            path.join(cwd, 'wheels', 'imagegen_worker-0.1.0-py3-none-any.whl'),
            'controlled non-editable wheel\n',
          )
          await fs.writeFile(path.join(cwd, 'wheels', '.gitignore'), '*\n')
        } else {
          installed = true
          await fs.rm(workerRoot, { recursive: true })
          await fs.cp(path.join(cwd, 'src', 'imagegen_worker'), workerRoot, { recursive: true })
          await fs.writeFile(path.join(distInfoRoot, 'RECORD'), 'changed worker-only record\n')
          await fs.writeFile(
            path.join(environmentRoot, 'bin', 'imagegen-worker'),
            'updated launcher\n',
          )
        }
      },
      qualify: async () => ({
        ready: (await fs.readFile(path.join(workerRoot, 'inference.py'), 'utf8')).includes('0.14.0')
          ? structuredClone(newReady)
          : structuredClone(originalReady),
        confirmedWorkerExit: true,
      }),
    }
    async function preserved() {
      assert.ok(
        (await fs.readFile(metadataPath)).equals(original.metadata),
        'qualification metadata must be byte exact',
      )
      assert.ok(
        (await fs.readFile(pointerPath)).equals(original.pointer),
        'active pointer must be byte exact',
      )
      assert.ok(
        (await fs.readFile(historicalReport)).equals(original.report),
        'historical report must be byte exact',
      )
      assert.deepEqual(
        await treeManifest(workerRoot, { bytecode: true, modes: true }),
        original.worker,
      )
      assert.deepEqual(
        await treeManifest(distInfoRoot, { bytecode: true, modes: true }),
        original.distribution,
      )
      assert.ok(
        (await fs.readFile(path.join(environmentRoot, 'bin', 'imagegen-worker'))).equals(
          original.launcher,
        ),
      )
    }
    await run({
      root,
      appData,
      project,
      workerRoot,
      distInfoRoot,
      ownedPython,
      environmentRoot,
      report,
      historicalReport,
      metadataPath,
      pointerPath,
      original,
      previous,
      options: { 'app-data': appData, uv, report },
      dependencies,
      commands,
      inspection,
      preserved,
      wasInstalled: () => installed,
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('successful worker-only update publishes fresh manifest after close and keeps historical report/pointer', async () => {
  await fixture(async (f) => {
    const order = []
    const qualify = f.dependencies.qualify
    f.dependencies.qualify = async (context) => {
      await assert.rejects(fs.lstat(f.report), { code: 'ENOENT' })
      assert.ok((await fs.readFile(f.metadataPath)).equals(f.original.metadata))
      order.push('physical-worker-exit')
      return qualify(context)
    }
    const report = await upgradeQualificationWorker(f.options, f.dependencies)
    assert.deepEqual(order, ['physical-worker-exit'])
    assert.equal(report.status, 'activated-qualified')
    assert.equal(report.ready.workerVersion, '0.14.0')
    assert.equal(
      JSON.parse(await fs.readFile(f.report, 'utf8')).installed.distInfoRoot,
      f.distInfoRoot,
    )
    assert.equal(JSON.parse(await fs.readFile(f.metadataPath, 'utf8')).report, f.report)
    assert.ok((await fs.readFile(f.historicalReport)).equals(f.original.report))
    assert.ok((await fs.readFile(f.pointerPath)).equals(f.original.pointer))
    assert.equal(f.commands.length, 2)
    assert.ok(f.commands[1].includes('--no-deps'))
    assert.ok(f.commands[1].includes('--reinstall'))
    assert.ok(f.commands[1].includes('copy'))
    await assert.rejects(fs.lstat(report.rollbackBackup.path), { code: 'ENOENT' })
    await assert.rejects(
      fs.lstat(path.join(f.appData, 'runtime', '.qualification-worker-upgrade.lock')),
      { code: 'ENOENT' },
    )
  })
})

test('a partially failed uv install restores package, dist-info, launcher, metadata and proves original worker startup', async () => {
  await fixture(async (f) => {
    const runCommand = f.dependencies.runCommand
    f.dependencies.runCommand = async (...args) => {
      await runCommand(...args)
      if (args[1][0] === 'pip') throw new Error('controlled partial install refusal')
    }
    await assert.rejects(
      upgradeQualificationWorker(f.options, f.dependencies),
      /partial install refusal/,
    )
    await f.preserved()
    const failure = JSON.parse(await fs.readFile(f.report, 'utf8'))
    assert.equal(failure.status, 'failed')
    assert.equal(failure.rollback.proven, true)
    assert.equal(failure.rollback.startup.ready.workerVersion, '0.12.0')
    await assert.rejects(fs.lstat(failure.rollbackBackup.path), { code: 'ENOENT' })
  })
})

for (const [name, mutate] of [
  [
    'missing native noise capability',
    (ready) => {
      ready.capabilities = ready.capabilities.filter((v) => v !== 'illustrious-noise-profile')
    },
  ],
  [
    'wrong worker version',
    (ready) => {
      ready.workerVersion = '0.13.0'
    },
  ],
  [
    'lost prior capability',
    (ready) => {
      ready.capabilities = ready.capabilities.filter((v) => v !== 'target-composition')
    },
  ],
]) {
  test(`${name} refuses activation and restores original worker`, async () => {
    await fixture(async (f) => {
      const qualify = f.dependencies.qualify
      f.dependencies.qualify = async (context) => {
        const result = await qualify(context)
        if (result.ready.workerVersion === '0.14.0') mutate(result.ready)
        return result
      }
      await assert.rejects(
        upgradeQualificationWorker(f.options, f.dependencies),
        /retain prior capabilities/,
      )
      await f.preserved()
      assert.equal(JSON.parse(await fs.readFile(f.report, 'utf8')).rollback.proven, true)
    })
  })
}

test('dependency drift caused during install cannot activate even when worker would start', async () => {
  await fixture(async (f) => {
    f.dependencies.inspect = async (...args) => {
      const inspected = await f.inspection(...args)
      if ((await fs.readFile(path.join(f.workerRoot, 'inference.py'), 'utf8')).includes('0.14.0'))
        inspected.packages.torch = 'unapproved-version'
      return inspected
    }
    await assert.rejects(
      upgradeQualificationWorker(f.options, f.dependencies),
      /dependency versions after/,
    )
    await f.preserved()
    assert.equal(JSON.parse(await fs.readFile(f.report, 'utf8')).rollback.proven, true)
  })
})

for (const [name, prepare, expected] of [
  [
    'changed original worker source',
    async (f) => fs.appendFile(path.join(f.workerRoot, '__init__.py'), 'MUTATED = True\n'),
    /Original installed worker payload/,
  ],
  [
    'changed current lock',
    async (f) => fs.appendFile(path.join(f.project, 'uv.lock'), 'drift\n'),
    /Dependency lock/,
  ],
  [
    'changed installed dependency',
    async (f) => {
      f.dependencies.inspect = async () => ({
        ...(await f.inspection()),
        packages: { ...f.previous.installed.packages, torch: 'drift' },
      })
    },
    /Original installed dependencies/,
  ],
  [
    'unsafe dist-info symlink',
    async (f) => fs.symlink(f.historicalReport, path.join(f.distInfoRoot, 'external')),
    /Unsafe payload symlink/,
  ],
  [
    'wheel record outside owned package',
    async (f) => {
      f.dependencies.inspect = async () => ({
        ...(await f.inspection()),
        recordPaths: ['../../../../../../outside'],
      })
    },
    /RECORD escapes/,
  ],
]) {
  test(`${name} refuses before install or payload mutation`, async () => {
    await fixture(async (f) => {
      await prepare(f)
      const before = await fs.readFile(f.metadataPath)
      await assert.rejects(upgradeQualificationWorker(f.options, f.dependencies), expected)
      assert.equal(f.commands.length, 0)
      assert.equal(f.wasInstalled(), false)
      assert.ok((await fs.readFile(f.metadataPath)).equals(before))
      assert.ok((await fs.readFile(f.historicalReport)).equals(f.original.report))
    })
  })
}

test('unconfirmed worker exit retains rollback bytes and lock and refuses filesystem restoration', async () => {
  await fixture(async (f) => {
    f.dependencies.qualify = async () => {
      throw Object.assign(new Error('controlled worker still alive'), {
        confirmedWorkerExit: false,
      })
    }
    await assert.rejects(
      upgradeQualificationWorker(f.options, f.dependencies),
      /worker still alive/,
    )
    const failure = JSON.parse(await fs.readFile(f.report, 'utf8'))
    assert.equal(failure.confirmedWorkerExit, false)
    assert.match(failure.rollbackError, /physical exit is unconfirmed/)
    await fs.stat(failure.rollbackBackup.path)
    await fs.stat(path.join(f.appData, 'runtime', '.qualification-worker-upgrade.lock'))
    assert.equal(JSON.parse(await fs.readFile(f.metadataPath, 'utf8')).report, f.historicalReport)
    assert.match(await fs.readFile(path.join(f.workerRoot, 'inference.py'), 'utf8'), /0\.14\.0/)
  })
})

test('failed independent rollback startup retains backup instead of claiming restoration proof', async () => {
  await fixture(async (f) => {
    let count = 0
    f.dependencies.qualify = async () => {
      if (++count === 1)
        return { ready: { ...newReady, workerVersion: '0.13.0' }, confirmedWorkerExit: true }
      throw Object.assign(new Error('controlled rollback startup refusal'), {
        confirmedWorkerExit: true,
      })
    }
    await assert.rejects(
      upgradeQualificationWorker(f.options, f.dependencies),
      /retain prior capabilities/,
    )
    await f.preserved()
    const failure = JSON.parse(await fs.readFile(f.report, 'utf8'))
    assert.equal(failure.rollback.proven, undefined)
    assert.match(failure.rollbackError, /rollback startup refusal/)
    await fs.stat(failure.rollbackBackup.path)
  })
})

for (const { name, mutate, refusal } of [
  {
    name: 'worker bytes',
    mutate: (f) =>
      fs.appendFile(path.join(f.workerRoot, 'inference.py'), '\n# late byte-change fixture\n'),
    refusal: /Original worker bytes\/modes after restored startup/,
  },
  {
    name: 'worker mode',
    mutate: async (f) => {
      const target = path.join(f.workerRoot, 'inference.py')
      await fs.chmod(target, ((await fs.stat(target)).mode & 0o777) ^ 0o100)
    },
    refusal: /Original worker bytes\/modes after restored startup/,
  },
  {
    name: 'launcher bytes',
    mutate: (f) =>
      fs.appendFile(
        path.join(f.environmentRoot, 'bin', 'imagegen-worker'),
        'late launcher fixture\n',
      ),
    refusal: /Original launcher bytes after restored startup/,
  },
  {
    name: 'launcher mode',
    mutate: async (f) => {
      const target = path.join(f.environmentRoot, 'bin', 'imagegen-worker')
      await fs.chmod(target, ((await fs.stat(target)).mode & 0o777) ^ 0o100)
    },
    refusal: /Original launcher mode after restored startup/,
  },
  {
    name: 'active pointer bytes',
    mutate: (f) => fs.appendFile(f.pointerPath, ' '),
    refusal: /Unchanged active runtime pointer after restored startup/,
  },
])
  test(`late restored ${name} change retains rollback data without claiming final proof`, async () => {
    await fixture(async (f) => {
      let calls = 0
      f.dependencies.qualify = async () => {
        if (++calls === 1)
          return { ready: { ...newReady, workerVersion: '0.13.0' }, confirmedWorkerExit: true }
        // The real restore has already put the complete original payload back. A late change
        // after the apparent restored startup must still fail the final filesystem fence.
        await f.preserved()
        await mutate(f)
        return { ready: structuredClone(originalReady), confirmedWorkerExit: true }
      }
      await assert.rejects(
        upgradeQualificationWorker(f.options, f.dependencies),
        /retain prior capabilities/,
      )
      const failure = JSON.parse(await fs.readFile(f.report, 'utf8'))
      assert.equal(failure.rollback.startup.ready.workerVersion, '0.12.0')
      assert.equal(failure.rollback.startup.confirmedWorkerExit, true)
      assert.equal(failure.rollback.proven, undefined)
      assert.match(failure.rollbackError, refusal)
      await fs.stat(failure.rollbackBackup.path)
      await fs.stat(path.join(f.appData, 'runtime', '.qualification-worker-upgrade.lock'))
      assert.deepEqual(
        await treeManifest(path.join(failure.rollbackBackup.path, 'worker'), {
          bytecode: true,
          modes: true,
        }),
        f.original.worker,
      )
      assert.deepEqual(
        await treeManifest(path.join(failure.rollbackBackup.path, 'dist-info'), {
          bytecode: true,
          modes: true,
        }),
        f.original.distribution,
      )
      assert.ok(
        (await fs.readFile(path.join(failure.rollbackBackup.path, 'launcher'))).equals(
          f.original.launcher,
        ),
      )
      assert.ok(
        (await fs.readFile(path.join(failure.rollbackBackup.path, 'current-runtime.json'))).equals(
          f.original.pointer,
        ),
      )
      for (const [file, bytes] of [
        [f.metadataPath, f.original.metadata],
        [f.historicalReport, f.original.report],
      ])
        assert.ok((await fs.readFile(file)).equals(bytes))
      assert.equal(
        (await fs.readFile(f.pointerPath)).equals(f.original.pointer),
        name !== 'active pointer bytes',
      )
    })
  })

test('restored startup may regenerate bytecode while immutable source restoration remains proven', async () => {
  await fixture(async (f) => {
    let calls = 0
    const cacheDirectory = path.join(f.workerRoot, '__pycache__')
    const cacheFile = path.join(cacheDirectory, 'inference.cpython-312.pyc')
    const originalSource = await treeManifest(f.workerRoot, { modes: true })
    await fs.mkdir(cacheDirectory)
    await fs.writeFile(cacheFile, 'controlled original bytecode\n')
    f.original.worker = await treeManifest(f.workerRoot, { bytecode: true, modes: true })
    f.dependencies.qualify = async () => {
      if (++calls === 1)
        return { ready: { ...newReady, workerVersion: '0.13.0' }, confirmedWorkerExit: true }
      await f.preserved()
      await fs.writeFile(cacheFile, 'controlled regenerated bytecode\n')
      return { ready: structuredClone(originalReady), confirmedWorkerExit: true }
    }
    await assert.rejects(
      upgradeQualificationWorker(f.options, f.dependencies),
      /retain prior capabilities/,
    )
    const failure = JSON.parse(await fs.readFile(f.report, 'utf8'))
    assert.equal(failure.rollback.proven, true)
    assert.equal(failure.rollbackError, undefined)
    assert.equal(failure.rollback.startup.confirmedWorkerExit, true)
    assert.deepEqual(await treeManifest(f.workerRoot, { modes: true }), originalSource)
    assert.equal(await fs.readFile(cacheFile, 'utf8'), 'controlled regenerated bytecode\n')
    await assert.rejects(fs.stat(failure.rollbackBackup.path), { code: 'ENOENT' })
    await assert.rejects(
      fs.stat(path.join(f.appData, 'runtime', '.qualification-worker-upgrade.lock')),
      { code: 'ENOENT' },
    )
    for (const [file, bytes] of [
      [f.metadataPath, f.original.metadata],
      [f.pointerPath, f.original.pointer],
      [f.historicalReport, f.original.report],
    ])
      assert.ok((await fs.readFile(file)).equals(bytes))
  })
})

test('unbounded or busy runtime refuses before commands and backup creation', async () => {
  for (const guard of ['assertBounds', 'assertIdle']) {
    await fixture(async (f) => {
      f.dependencies[guard] = async () => {
        throw new Error(`controlled ${guard} refusal`)
      }
      await assert.rejects(
        upgradeQualificationWorker(f.options, f.dependencies),
        /controlled .* refusal/,
      )
      assert.equal(f.commands.length, 0)
      await f.preserved()
      assert.deepEqual(await fs.readdir(path.join(f.appData, 'cache', 'runtime-downloads')), [])
    })
  }
})

test('owned artifact root and separate report prevent ordinary app-data/report mutation', async () => {
  await fixture(async (f) => {
    await assert.rejects(
      upgradeQualificationWorker(
        { ...f.options, 'app-data': path.join(os.tmpdir(), 'ordinary-app-data') },
        f.dependencies,
      ),
      /inside the owned artifact root/,
    )
    await assert.rejects(
      upgradeQualificationWorker(
        { ...f.options, report: path.join(f.appData, 'upgrade-report.json') },
        f.dependencies,
      ),
      /external new report/,
    )
    await assert.rejects(
      upgradeQualificationWorker({ ...f.options, report: f.historicalReport }, f.dependencies),
      /Refusing existing path/,
    )
    await f.preserved()
    assert.equal(f.commands.length, 0)
  })
})

test('deadline, memory and actual cgroup readback are required before bounded worker launch', async () => {
  const group = '/user.slice/qualification.service'
  const files = new Map([
    [`/proc/100/cgroup`, `0::${group}\n`],
    [`/sys/fs/cgroup${group}/memory.max`, '12884901888'],
    [`/sys/fs/cgroup${group}/memory.swap.max`, '0'],
  ])
  let deadline = '30min'
  let controlGroup = group
  const dependencies = {
    pid: 100,
    read: async (p) => files.get(p),
    exec: async () => ({ stdout: `ControlGroup=${controlGroup}\nRuntimeMaxUSec=${deadline}\n` }),
  }
  assert.equal((await assertUpgradeBounds(dependencies)).runtimeMaxSeconds, 1800)
  deadline = 'infinity'
  await assert.rejects(assertUpgradeBounds(dependencies), /finite inherited systemd deadline/)
  deadline = '1801s'
  await assert.rejects(assertUpgradeBounds(dependencies), /RuntimeMaxSec/)
  deadline = '600s'
  files.set(`/sys/fs/cgroup${group}/memory.max`, 'max')
  await assert.rejects(assertUpgradeBounds(dependencies), /MemoryMax/)
  files.set(`/sys/fs/cgroup${group}/memory.max`, '12884901888')
  files.set(`/sys/fs/cgroup${group}/memory.swap.max`, '1')
  await assert.rejects(assertUpgradeBounds(dependencies), /MemorySwapMax/)
  files.set(`/sys/fs/cgroup${group}/memory.swap.max`, '0')
  controlGroup = '/unrelated.service'
  await assert.rejects(assertUpgradeBounds(dependencies), /ControlGroup does not match/)
  assert.equal(systemdDeadlineSeconds('600000000us'), 600)
  assert.throws(() => systemdDeadlineSeconds('0'), /RuntimeMaxSec/)
})

test('physical-use guard sees a live owned interpreter and an app-data consumer without signalling either', async () => {
  const appData = '/owned/data'
  const ownedPython = '/owned/data/runtime/python/managed'
  let executable = `${ownedPython}/bin/python3.12`
  let cwd = '/unrelated'
  let command = 'python\0'
  const deps = {
    entries: async () => ['200001'],
    stat: async () => ({ uid: process.getuid() }),
    link: async (p) => (p.endsWith('/exe') ? executable : cwd),
    read: async (p) => (p.endsWith('/cmdline') ? command : ''),
  }
  await assert.rejects(
    assertRuntimeIdle(appData, ownedPython, deps),
    /physically in use by PIDs: 200001/,
  )
  executable = '/usr/bin/electron'
  command = `electron\0--app-data=${appData}\0`
  await assert.rejects(assertRuntimeIdle(appData, ownedPython, deps), /physically in use/)
  command = 'electron\0'
  cwd = `${appData}/cache/runtime-downloads`
  await assert.rejects(assertRuntimeIdle(appData, ownedPython, deps), /physically in use/)
  cwd = '/unrelated'
  assert.equal((await assertRuntimeIdle(appData, ownedPython, deps)).noLiveRuntimeUsers, true)
})

test('CLI requires explicit absolute arguments and rejects repeated options', () => {
  assert.equal(argumentsFor(['--help']), null)
  assert.throws(() => argumentsFor([]), /Required argument: --app-data/)
  assert.throws(
    () => argumentsFor(['--app-data', 'relative', '--uv', '/uv', '--report', '/report']),
    /absolute normalized/,
  )
  assert.throws(
    () =>
      argumentsFor([
        '--app-data',
        '/owned',
        '--uv',
        '/uv',
        '--report',
        '/report',
        '--uv',
        '/second',
      ]),
    /repeated/,
  )
})

test('protected desktop services do not hide app-data consumers or unknown inaccessible processes', async () => {
  let command = '/usr/lib/systemd/systemd\0--user\0'
  const denied = Object.assign(new Error('protected proc link'), { code: 'EACCES' })
  const deps = {
    entries: async () => ['200001'],
    stat: async () => ({ uid: process.getuid() }),
    read: async () => command,
    link: async () => {
      throw denied
    },
  }
  assert.equal(
    (await assertRuntimeIdle('/owned/data', '/owned/data/runtime/python', deps)).noLiveRuntimeUsers,
    true,
  )
  command = '/usr/lib/systemd/systemd\0--app-data=/owned/data\0'
  await assert.rejects(
    assertRuntimeIdle('/owned/data', '/owned/data/runtime/python', deps),
    /physically in use/,
  )
  command = '/usr/bin/electron\0'
  await assert.rejects(assertRuntimeIdle('/owned/data', '/owned/data/runtime/python', deps), {
    code: 'EACCES',
  })
})

test('external options file uses the same strict argument guard without exposing runtime argv paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-upgrade-options-'))
  const file = path.join(root, 'options.json')
  const options = { 'app-data': '/owned/data', uv: '/uv', report: '/owned/report' }
  try {
    await fs.writeFile(file, JSON.stringify(options))
    assert.deepEqual(await readUpgradeOptionsFile(file, root), options)
    await fs.writeFile(file, JSON.stringify({ ...options, unexpected: 'argument' }))
    await assert.rejects(readUpgradeOptionsFile(file, root), /Unknown or repeated/)
    await fs.writeFile(file, JSON.stringify({ ...options, uv: 1 }))
    await assert.rejects(readUpgradeOptionsFile(file, root), /string-valued/)
    await fs.rm(file)
    await fs.symlink('/unrelated/file', file)
    await assert.rejects(readUpgradeOptionsFile(file, root), /canonical regular file/)
    await assert.rejects(
      readUpgradeOptionsFile('/unrelated/file', root),
      /inside the owned artifact root/,
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
