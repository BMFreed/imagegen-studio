/** Argument/artifact refusal and streaming controls only; no runtime install or GPU qualification. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  argumentsFrom,
  stableFile,
  validateFullWheelhouseProof,
} from './qualify-runtime-offline.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const baseArguments = [
  '--python-root',
  '/fixture/python',
  '--uv',
  '/fixture/uv',
  '--config',
  '/fixture/config',
  '--wheels',
  '/fixture/wheels',
  '--report-file',
  '/fixture/report.json',
]

function fixture() {
  const wheels = Array.from({ length: 67 }, (_, index) => {
    const distribution =
      index === 0 ? 'imagegen-worker' : `package${String(index).padStart(2, '0')}`
    const version = index === 0 ? '0.1.0' : '1.0'
    const filename = `${distribution.replaceAll('-', '_')}-${version}-py3-none-any.whl`
    return {
      distribution,
      version,
      filename,
      path: `wheels/${filename}`,
      sha256: 'a'.repeat(64),
      sizeBytes: 10,
      url: index === 0 ? null : `https://example.invalid/${filename}`,
    }
  })
  const target = { os: 'linux', arch: 'x64', pythonVersion: '3.12.13', glibcMinimum: '2.28' }
  const requirements = wheels
    .map((entry) => `${entry.distribution}==${entry.version} --hash=sha256:${entry.sha256}\n`)
    .join('')
  const plan = {
    schemaVersion: 1,
    scope: 'linux-nvidia-wheelhouse-plan',
    dependencyPolicy: 'invoke-inference-v1',
    rootExtras: ['inference'],
    excludedDependencies: ['notebook'],
    artifactBytesVerified: false,
    dependencyEvidence: 'lock-graph-only',
    installQualified: false,
    target,
    wheels,
    requirements,
    totalWheelBytes: 670,
    externalWheelBytes: 660,
  }
  const verification = {
    schemaVersion: 1,
    scope: 'linux-nvidia-wheelhouse-verification',
    artifactBytesVerified: true,
    dependencyEvidence: 'wheel-metadata',
    installQualified: false,
    dependencyPolicy: 'invoke-inference-v1',
    target,
    wheelCount: 67,
    totalWheelBytes: 670,
    wheels: structuredClone(wheels),
    dependencyCheck: {
      status: 'ok',
      schemaVersion: 1,
      policy: 'invoke-inference-v1',
      root: 'imagegen-worker',
      pythonVersion: '3.12.13',
      packageCount: 67,
      rootExtras: ['inference'],
      excludedDependencies: ['notebook'],
    },
  }
  return { plan, verification }
}

function encoded(plan, verification, rebind = true) {
  const planBytes = Buffer.from(`${JSON.stringify(plan)}\n`)
  const value = structuredClone(verification)
  if (rebind) value.planSha256 = digest(planBytes)
  return [Buffer.from(`${JSON.stringify(value)}\n`), planBytes]
}

async function owned(use) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-qualifier-test-'))
  try {
    await use(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('legacy arguments retain the two-wheel CPU profile without requesting a full proof', () => {
  const actual = argumentsFrom(baseArguments)
  assert.equal(actual.profile, undefined)
  assert.equal(actual['wheelhouse-report'], undefined)
  assert.equal(actual['python-root'], '/fixture/python')
})

test('full-inference requires its explicit local proof and all five original inputs', () => {
  const actual = argumentsFrom([
    ...baseArguments,
    '--profile',
    'full-inference',
    '--wheelhouse-report',
    '/fixture/evidence/wheelhouse-verification.json',
  ])
  assert.equal(actual.profile, 'full-inference')
  assert.equal(actual['wheelhouse-report'], '/fixture/evidence/wheelhouse-verification.json')
})

test('invalid CLI choices refuse before any filesystem or hardware qualification', async (t) => {
  const cases = [
    ['unknown profile', [...baseArguments, '--profile', 'cuda-auto']],
    ['missing full proof', [...baseArguments, '--profile', 'full-inference']],
    [
      'proof without full profile',
      [...baseArguments, '--wheelhouse-report', '/fixture/report.json'],
    ],
    ['missing original input', baseArguments.slice(0, -2)],
    ['duplicate input', [...baseArguments, '--uv', '/fixture/second-uv']],
    ['unknown input', [...baseArguments, '--checkpoint', '/fixture/model']],
    ['relative input', [...baseArguments.slice(0, 1), 'relative', ...baseArguments.slice(2)]],
    [
      'noncanonical input',
      [...baseArguments.slice(0, 1), '/fixture/../python', ...baseArguments.slice(2)],
    ],
    ['missing value', [...baseArguments, '--profile']],
  ]
  for (const [label, arguments_] of cases) {
    await t.test(label, () => assert.throws(() => argumentsFrom(arguments_)))
  }
})

test('synthetic proof validates binding and membership only, never claims installed qualification', () => {
  const { plan, verification } = fixture()
  const actual = validateFullWheelhouseProof(...encoded(plan, verification))
  assert.equal(actual.plan.wheels.length, 67)
  assert.equal(actual.verification.installQualified, false)
})

test('a report cannot borrow a different plan even if all declared fields look valid', () => {
  const { plan, verification } = fixture()
  verification.planSha256 = '0'.repeat(64)
  assert.throws(
    () => validateFullWheelhouseProof(...encoded(plan, verification, false)),
    /bound to exact plan bytes/,
  )
})

test('unqualified, broadened, missing and mismatching artifact proofs refuse', async (t) => {
  const cases = [
    [
      'unverified bytes',
      (p, v) => {
        v.artifactBytesVerified = false
      },
    ],
    [
      'false installed promotion',
      (p, v) => {
        v.installQualified = true
      },
    ],
    [
      'wrong evidence',
      (p, v) => {
        v.dependencyEvidence = 'lock-graph-only'
      },
    ],
    [
      'wrong policy',
      (p, v) => {
        v.dependencyPolicy = 'ignore-all'
      },
    ],
    [
      'wrong target',
      (p) => {
        p.target.arch = 'arm64'
      },
    ],
    [
      'missing wheel',
      (p) => {
        p.wheels.pop()
      },
    ],
    [
      'duplicate wheel',
      (p) => {
        p.wheels[66] = structuredClone(p.wheels[1])
      },
    ],
    [
      'report missing row',
      (p, v) => {
        v.wheels.pop()
      },
    ],
    [
      'report duplicate row',
      (p, v) => {
        v.wheels[66] = structuredClone(v.wheels[1])
      },
    ],
    [
      'report wrong version',
      (p, v) => {
        v.wheels[1].version = '2.0'
      },
    ],
    [
      'report wrong digest',
      (p, v) => {
        v.wheels[1].sha256 = 'b'.repeat(64)
      },
    ],
    [
      'unsafe filename',
      (p) => {
        p.wheels[1].filename = '../escape.whl'
      },
    ],
    [
      'unsafe artifact path',
      (p) => {
        p.wheels[1].path = 'other/file.whl'
      },
    ],
    [
      'invalid digest',
      (p) => {
        p.wheels[1].sha256 = 'x'
      },
    ],
    [
      'wrong byte count',
      (p) => {
        p.totalWheelBytes += 1
      },
    ],
    [
      'wrong requirement text',
      (p) => {
        p.requirements += '--index-url https://example.invalid\n'
      },
    ],
    [
      'broadened exclusions',
      (p) => {
        p.excludedDependencies.push('torch')
      },
    ],
    [
      'failed metadata verdict',
      (p, v) => {
        v.dependencyCheck.status = 'error'
      },
    ],
    [
      'wrong installed policy',
      (p, v) => {
        v.dependencyCheck.policy = 'strict'
      },
    ],
  ]
  for (const [label, change] of cases) {
    await t.test(label, () => {
      const { plan, verification } = fixture()
      change(plan, verification)
      assert.throws(() => validateFullWheelhouseProof(...encoded(plan, verification)))
    })
  }
})

test('proof JSON is bounded before parsing', () => {
  const { plan, verification } = fixture()
  const [v, p] = encoded(plan, verification)
  assert.throws(() => validateFullWheelhouseProof(Buffer.alloc(2 * 1024 ** 2 + 1), p), /exceeds/)
  assert.throws(() => validateFullWheelhouseProof(v, Buffer.alloc(8 * 1024 ** 2 + 1)), /exceeds/)
  assert.throws(() => validateFullWheelhouseProof(Buffer.from('{'), p))
})

test('streamed copying binds exact digest and refuses overwrite or changed source identity', async () => {
  await owned(async (root) => {
    const source = path.join(root, 'source')
    const destination = path.join(root, 'copied')
    await fs.writeFile(source, 'abc')
    const snapshot = await stableFile(source)
    assert.equal(
      snapshot.sha256,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    await stableFile(source, destination, snapshot)
    assert.equal(await fs.readFile(destination, 'utf8'), 'abc')
    await assert.rejects(
      stableFile(source, destination, snapshot),
      (error) => error.code === 'EEXIST',
    )
    assert.equal(await fs.readFile(destination, 'utf8'), 'abc')
    const replacement = path.join(root, 'replacement')
    await fs.writeFile(replacement, 'abc')
    await fs.rename(replacement, source)
    await assert.rejects(stableFile(source, path.join(root, 'stale-copy'), snapshot))
    await assert.rejects(
      fs.lstat(path.join(root, 'stale-copy')),
      (error) => error.code === 'ENOENT',
    )
  })
})

test('a wrong expected hash is rejected even when its size and initial identity match', async () => {
  await owned(async (root) => {
    const source = path.join(root, 'source')
    await fs.writeFile(source, 'abc')
    const snapshot = await stableFile(source)
    await assert.rejects(
      stableFile(source, path.join(root, 'bad-copy'), { ...snapshot, sha256: '0'.repeat(64) }),
    )
    assert.equal(await fs.readFile(source, 'utf8'), 'abc')
  })
})

test('streaming accepts an ordinary sparse file beyond the former 128MiB slurp bound', async () => {
  await owned(async (root) => {
    const source = path.join(root, 'large-source')
    const destination = path.join(root, 'large-copy')
    const size = 128 * 1024 ** 2 + 17
    const file = await fs.open(source, 'wx')
    try {
      await file.truncate(size)
      await file.write(Buffer.from('edge'), 0, 4, size - 4)
    } finally {
      await file.close()
    }
    const copied = await stableFile(source, destination)
    assert.equal(copied.sizeBytes, size)
    assert.equal((await fs.stat(destination)).size, size)
    const reader = await fs.open(destination, 'r')
    try {
      const tail = Buffer.alloc(4)
      await reader.read(tail, 0, 4, size - 4)
      assert.equal(tail.toString(), 'edge')
    } finally {
      await reader.close()
    }
  })
})

test('symlink sources and over-bound sparse sources refuse before streaming', async () => {
  await owned(async (root) => {
    const source = path.join(root, 'source')
    await fs.writeFile(source, 'abc')
    const link = path.join(root, 'link')
    await fs.symlink(source, link)
    await assert.rejects(stableFile(link))
    const large = await fs.open(path.join(root, 'over-bound'), 'wx')
    try {
      await large.truncate(32 * 1024 ** 3 + 1)
    } finally {
      await large.close()
    }
    await assert.rejects(stableFile(path.join(root, 'over-bound')), /ordinary bounded/)
  })
})
