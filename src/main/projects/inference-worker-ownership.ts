import { type BigIntStats, constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'

/** Private operational ownership; never accepted from a renderer or stored in portable provenance. */
export interface InferenceWorkerOwner {
  readonly bootId: string
  readonly main: { readonly pid: number; readonly startTicks: string }
  readonly worker: { readonly pid: number; readonly startTicks: string }
}

export class InferenceWorkerOwnershipError extends Error {
  readonly code = 'WORKER_VERSION_MISMATCH'

  constructor() {
    super('The inference worker lifetime owner could not be verified.')
    this.name = 'InferenceWorkerOwnershipError'
  }
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const POSITIVE_DECIMAL = /^[1-9]\d{0,19}$/
const MAX_UINT64 = (1n << 64n) - 1n
const MAX_KERNEL_FILE_BYTES = 64 * 1024

type ProcessIdentity = { parentPid: number; pid: number; startTicks: string }

/** Detach synchronously before any filesystem await; supplied private values grant no paths. */
export function captureInferenceWorkerOwnerValue(input: unknown): InferenceWorkerOwner {
  try {
    if (!exactObject(input, ['bootId', 'main', 'worker'])) {
      fail()
    }
    if (
      !exactObject(input.main, ['pid', 'startTicks']) ||
      !exactObject(input.worker, ['pid', 'startTicks'])
    ) {
      fail()
    }
    const value: unknown = structuredClone(input)
    if (!exactObject(value, ['bootId', 'main', 'worker'])) {
      fail()
    }
    const main = value.main
    const worker = value.worker
    if (
      typeof value.bootId !== 'string' ||
      !UUID.test(value.bootId) ||
      !exactObject(main, ['pid', 'startTicks']) ||
      !exactObject(worker, ['pid', 'startTicks']) ||
      !validPid(main.pid) ||
      !validPid(worker.pid) ||
      main.pid === worker.pid ||
      !validTicks(main.startTicks) ||
      !validTicks(worker.startTicks)
    ) {
      fail()
    }
    return Object.freeze({
      bootId: value.bootId,
      main: Object.freeze({ pid: main.pid, startTicks: main.startTicks }),
      worker: Object.freeze({ pid: worker.pid, startTicks: worker.startTicks }),
    })
  } catch {
    return fail()
  }
}

/**
 * Capture only a real Linux child after its owned-wrapper ready. InvokeAI a61ac4fb's
 * install_staging_ledger.py uses boot/start identities for active claims; the calibration store
 * supplies the child-held flock pattern. This adapter records identity and never signals a PID.
 */
export async function captureInferenceWorkerOwner(childPid: number): Promise<InferenceWorkerOwner> {
  try {
    if (process.platform !== 'linux' || !validPid(childPid) || !validPid(process.pid)) {
      fail()
    }
    const uid = process.getuid?.()
    if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) {
      fail()
    }
    const firstBoot = await bootId()
    const firstMain = await processIdentity(process.pid, uid, true)
    const firstChild = await processIdentity(childPid, uid)
    const lastChild = await processIdentity(childPid, uid)
    const lastMain = await processIdentity(process.pid, uid, true)
    if (
      firstBoot !== (await bootId()) ||
      firstMain.startTicks !== lastMain.startTicks ||
      firstChild.startTicks !== lastChild.startTicks ||
      firstChild.parentPid !== process.pid ||
      lastChild.parentPid !== process.pid
    ) {
      fail()
    }
    return captureInferenceWorkerOwnerValue({
      bootId: firstBoot,
      main: { pid: process.pid, startTicks: firstMain.startTicks },
      worker: { pid: childPid, startTicks: firstChild.startTicks },
    })
  } catch {
    return fail()
  }
}

/** Exact recovery marker; device/inode strings retain native bigint precision and contain no paths. */
export function serializeRegionalTransportOwner(
  input: InferenceWorkerOwner,
  directory: { dev: bigint; ino: bigint },
): Buffer {
  const owner = captureInferenceWorkerOwnerValue(input)
  if (
    typeof directory.dev !== 'bigint' ||
    typeof directory.ino !== 'bigint' ||
    directory.dev < 0n ||
    directory.ino < 0n ||
    directory.dev > MAX_UINT64 ||
    directory.ino > MAX_UINT64
  ) {
    fail()
  }
  const bytes = Buffer.from(
    JSON.stringify({
      kind: 'regional-transport-owner-v1',
      schemaVersion: 1,
      ...owner,
      directory: { device: directory.dev.toString(), inode: directory.ino.toString() },
    }),
    'utf8',
  )
  if (bytes.length > 4096) {
    fail()
  }
  return bytes
}

function fail(): never {
  throw new InferenceWorkerOwnershipError()
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor !== undefined && descriptor.enumerable && Object.hasOwn(descriptor, 'value')
    })
  )
}

function validPid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 1
}

function validTicks(value: unknown): value is string {
  return typeof value === 'string' && POSITIVE_DECIMAL.test(value) && BigInt(value) <= MAX_UINT64
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.uid === right.uid &&
    left.mode === right.mode
  )
}

/** Fixed kernel paths only; procfs reports size zero, so bound the actual read independently. */
async function readKernelFile(file: string, expectedUid?: number): Promise<string> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size > BigInt(MAX_KERNEL_FILE_BYTES) ||
      (expectedUid !== undefined && before.uid !== BigInt(expectedUid))
    ) {
      fail()
    }
    const bytes = Buffer.alloc(MAX_KERNEL_FILE_BYTES + 1)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (result.bytesRead === 0) {
        break
      }
      offset += result.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const atPath = await lstat(file, { bigint: true })
    if (
      offset === 0 ||
      offset > MAX_KERNEL_FILE_BYTES ||
      !after.isFile() ||
      !atPath.isFile() ||
      atPath.isSymbolicLink() ||
      !sameFile(before, after) ||
      !sameFile(before, atPath)
    ) {
      fail()
    }
    return bytes.subarray(0, offset).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function bootId(): Promise<string> {
  const value = (await readKernelFile('/proc/sys/kernel/random/boot_id')).trim()
  if (!UUID.test(value)) {
    fail()
  }
  return value
}

async function processIdentity(pid: number, uid: number, self = false): Promise<ProcessIdentity> {
  const root = self ? '/proc/self' : `/proc/${pid}`
  const stat = await readKernelFile(`${root}/stat`, uid)
  const boundary = stat.lastIndexOf(')')
  if (!stat.startsWith(`${pid} (`) || boundary < 0 || stat[boundary + 1] !== ' ') {
    fail()
  }
  // Fields after comm begin with state (field 3); starttime is field 22.
  const fields = stat
    .slice(boundary + 2)
    .trim()
    .split(/\s+/)
  const parent = fields[1]
  const startTicks = fields[19]
  if (
    !fields[0] ||
    !/^[DIKPRSTtW]$/.test(fields[0]) ||
    !parent ||
    !/^(0|[1-9]\d*)$/.test(parent) ||
    !Number.isSafeInteger(Number(parent)) ||
    !validTicks(startTicks)
  ) {
    fail()
  }
  const status = await readKernelFile(`${root}/status`, uid)
  const match = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status)
  if (!match || match.slice(1).some((value) => Number(value) !== uid)) {
    fail()
  }
  return { parentPid: Number(parent), pid, startTicks }
}
