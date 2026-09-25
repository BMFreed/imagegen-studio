/**
 * One in-process critical section per canonical Project file. Save and the derived Home index use
 * the same lock so a scan cannot publish stale health after an app-owned atomic replacement.
 * External processes are handled by fingerprint/revalidation, not by this lock.
 */
const pathLocks = new Map<string, Promise<void>>()

export async function withProjectPathLock<T>(
  canonicalPath: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = pathLocks.get(canonicalPath) ?? Promise.resolve()
  let release: () => void = () => undefined
  const active = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => active)
  pathLocks.set(canonicalPath, tail)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (pathLocks.get(canonicalPath) === tail) {
      pathLocks.delete(canonicalPath)
    }
  }
}
