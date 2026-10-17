import type { ProjectSmartPatchVariantsInspection } from '../../shared/projects/smart-patch-variants.js'

import type { ProjectTargetInspectionOwner } from './project-target-inspection-owner.js'

import { type ProjectWorkerClient, ProjectWorkerError } from './worker-client.js'

/** Retain stored diagnostics after confirmed ordinary worker failure, never uncertain exit. */
export async function inspectSmartPatchVariantsWithOptionalWorker(
  owner: Pick<ProjectTargetInspectionOwner, 'useWorker'>,
  read: (
    worker?: Pick<ProjectWorkerClient, 'composeTarget'>,
  ) => Promise<ProjectSmartPatchVariantsInspection>,
): Promise<ProjectSmartPatchVariantsInspection> {
  try {
    return (await owner.useWorker(read, { retainCompletedResult: false })) ?? (await read())
  } catch (error) {
    // start() confirms physical exit before ordinary startup errors. Uncertain exits retain
    // the child fence; a document conflict must likewise reach its caller without fallback.
    if (!(error instanceof ProjectWorkerError) || error.code === 'WORKER_EXIT_UNCONFIRMED') {
      throw error
    }
    return await read()
  }
}
