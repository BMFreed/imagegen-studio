/**
 * One in-process critical section per canonical storage path. Save and the derived Home index use
 * the Project file key so a scan cannot publish stale health after an app-owned atomic replacement.
 * Main also uses the catalog directory key around catalog/lifecycle commands so unregister cannot
 * overtake Open/Create/Import/scan. That outer key is distinct from every nested Project file key.
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
