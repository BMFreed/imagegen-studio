import type {
  AcceptedResultHistoryCursor,
  AcceptedResultHistoryEntry,
  AcceptedResultHistoryPage,
} from '../../../../../src/shared/projects/accepted-result-history.js'
import { ACCEPTED_RESULT_HISTORY_PAGE_SIZE } from '../../../../../src/shared/projects/accepted-result-history.js'

import digitalArtPreview from '../../assets/resource-previews/digital-art.svg'
import illustrationPreview from '../../assets/resource-previews/illustration.svg'

const projectKeys = [
  `project-v1-${'a'.repeat(64)}`,
  `project-v1-${'b'.repeat(64)}`,
  `project-v1-${'c'.repeat(64)}`,
]
const projectNames = [
  'Sample Project B.igs',
  'Midnight greenhouse.igs',
  'Character studies and lighting experiments with a deliberately long project name.igs',
]
const documentIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]
const documentRevisions = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
]

function layerId(index: number): string {
  return `44444444-4444-4444-8444-${index.toString(16).padStart(12, '0')}`
}

/** This fixture exercises the production browser component, not a second mock browser UI. */
export const acceptedResultsMock: AcceptedResultHistoryEntry[] = Array.from(
  { length: 57 },
  (_, index) => {
    const projectIndex = index % projectKeys.length
    return {
      acceptedAt: new Date(Date.UTC(2026, 8, 30, 12, 0) - index * 60_000).toISOString(),
      assetSha256: index.toString(16).padStart(64, '0'),
      documentId: documentIds[projectIndex]!,
      documentRevision: documentRevisions[projectIndex]!,
      height: index % 2 === 0 ? 1024 : 768,
      imageUrl:
        index === 0
          ? null
          : index === 2
            ? '/missing-current-preview.png'
            : index % 2 === 0
              ? illustrationPreview
              : digitalArtPreview,
      layerId: layerId(index),
      layerName:
        index === 0
          ? 'A very long accepted layer name that should truncate visibly while the complete title remains available on hover'
          : `Accepted composition ${String(index + 1).padStart(2, '0')}`,
      modelFileSha256: 'd'.repeat(64),
      modelName: 'Illustrious XL',
      modelVersionName: 'v1.1 main',
      projectKey: projectKeys[projectIndex]!,
      projectName: projectNames[projectIndex]!,
      seed: index === 0 ? 0 : 41_000 + index,
      width: index % 2 === 0 ? 1024 : 768,
    }
  },
)

export async function readAcceptedResultsMockPage(
  cursor: AcceptedResultHistoryCursor | null,
  _refresh: boolean,
): Promise<AcceptedResultHistoryPage> {
  let start = 0
  if (cursor) {
    const previous = acceptedResultsMock.findIndex(
      (item) =>
        item.acceptedAt === cursor.acceptedAt &&
        item.projectKey === cursor.projectKey &&
        item.layerId === cursor.layerId,
    )
    if (previous < 0) {
      throw new Error('The saved result page changed. Refresh the list.')
    }
    start = previous + 1
  }
  const items = acceptedResultsMock.slice(start, start + ACCEPTED_RESULT_HISTORY_PAGE_SIZE)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      start + items.length < acceptedResultsMock.length && last
        ? { acceptedAt: last.acceptedAt, layerId: last.layerId, projectKey: last.projectKey }
        : null,
    totalCount: acceptedResultsMock.length,
  }
}
