import type { ModelInstallJobView } from '../../shared/api.js'

/** Events observed during this read stay visible; unaffected jobs still come from Main's list. */
export function mergeModelManagerJobSnapshot(
  snapshot: readonly ModelInstallJobView[],
  observed: ReadonlyMap<string, ModelInstallJobView>,
): ModelInstallJobView[] {
  const listed = new Set(snapshot.map((job) => job.id))
  return [
    ...[...observed.values()].filter((job) => !listed.has(job.id)).reverse(),
    ...snapshot.map((job) => observed.get(job.id) ?? job),
  ]
}
