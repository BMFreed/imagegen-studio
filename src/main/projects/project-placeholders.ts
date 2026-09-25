import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type ProjectPlaceholderKind = 'empty' | 'unavailable'

/**
 * The desktop build bundles these immutable images beside the main process. The ZIP writer still
 * validates their real image bytes before any Save commits.
 */
export async function readProjectPlaceholders(
  bundledDirectory: string,
  kind: ProjectPlaceholderKind,
): Promise<{ merged: Buffer; thumbnail: Buffer }> {
  const [merged, thumbnail] = await Promise.all([
    readFile(path.join(bundledDirectory, `${kind}.png`)),
    readFile(path.join(bundledDirectory, `${kind}.webp`)),
  ])
  return { merged, thumbnail }
}
