import type { AppDatabase } from '../db/database.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'

export interface RecoveredGenerationRepositories {
  queue: GenerationQueueRepository
  smartPatchStaging: SmartPatchGenerationStagingRepository
  staging: GenerationStagingRepository
}

/**
 * Recover on the same repository instances that a processor will later use. A failure leaves no
 * dispatchable pair: queue cancellation must precede staging receipt reconciliation.
 */
export async function recoverGenerationRepositories(
  database: Pick<AppDatabase, 'db'>,
  dataRoot: string,
): Promise<RecoveredGenerationRepositories> {
  const queue = new GenerationQueueRepository(database.db, dataRoot)
  const staging = new GenerationStagingRepository(database.db, dataRoot)
  const smartPatchStaging = new SmartPatchGenerationStagingRepository(database.db, dataRoot)
  await queue.recoverAfterRestart()
  await staging.recoverAfterRestart()
  await smartPatchStaging.recoverAfterRestart()
  smartPatchStaging.assertReadyForPublication()
  queue.assertReadyForDispatch()
  staging.assertReadyForPublication()
  return { queue, smartPatchStaging, staging }
}
