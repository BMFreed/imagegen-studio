import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { PreparedAnimaGenerationBatch } from '../anima-generation-batch.js'
import type { GenerationStagingTestHooks } from '../generation-staging.js'
import type { AnimaBatchFixture } from './anima-batch.js'

import { openAppDatabase } from '../../db/database.js'
import { prepareAnimaGenerationBatch } from '../anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from '../anima-generation-request.js'
import { GenerationQueueRepository } from '../generation-queue.js'
import { GenerationStagingRepository } from '../generation-staging.js'
import { localProjectRecoveryKey } from '../project-identity.js'
import { ProjectSession } from '../project-session.js'
import { ANIMA_BATCH_READY, animaFixturePng, withAnimaBatchFixture } from './anima-batch.js'

export interface AnimaStagingFixture extends AnimaBatchFixture {
  database: ReturnType<typeof openAppDatabase>
  originalProjectBytes: Buffer
  outputBytes: Buffer
  projectPath: string
  queue: GenerationQueueRepository
  staging: GenerationStagingRepository
}

/**
 * Real SQLite, portable Project, request compilers and private filesystem publication. The tiny
 * exact-file resolver is inherited from the batch fixture; it does not qualify trained weights.
 */
export async function withAnimaStagingFixture(
  use: (fixture: AnimaStagingFixture) => Promise<void>,
  options: { opaque?: boolean; stagingHooks?: GenerationStagingTestHooks } = {},
): Promise<void> {
  await withAnimaBatchFixture(async (source) => {
    await chmod(source.scratch, 0o700)
    const project = await ProjectSession.create(
      path.join(source.root, 'Anima.igs'),
      'Anima staging fixture',
      {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: source.scratch,
      },
      source.prepared.context.bbox,
    )
    source.prepared.context.documentId = project.document.documentId
    source.prepared.context.documentRevision = project.document.documentRevision
    const database = openAppDatabase(source.root, path.resolve('src/main/db/migrations'))
    try {
      const queue = new GenerationQueueRepository(database.db, source.root)
      const staging = new GenerationStagingRepository(
        database.db,
        source.root,
        options.stagingHooks,
      )
      await queue.recoverAfterRestart()
      await staging.recoverAfterRestart()
      await use({
        ...source,
        database,
        originalProjectBytes: await readFile(project.filePath),
        outputBytes: await animaFixturePng(255),
        projectPath: project.filePath,
        queue,
        staging,
      })
    } finally {
      await database.close()
    }
  }, options)
}

export async function enqueueAnimaStagingBatch(
  fixture: AnimaStagingFixture,
  options: { iterations?: number; preparedBatch?: PreparedAnimaGenerationBatch } = {},
) {
  const preparedBatch =
    options.preparedBatch ??
    prepareAnimaGenerationBatch({
      iterations: options.iterations ?? 1,
      prepared: fixture.prepared,
    })
  const stagingSessionId = randomUUID()
  const items = await withAnimaGenerationBatchRequests({
    modelService: fixture.modelService,
    prepared: preparedBatch,
    ready: ANIMA_BATCH_READY,
    scratchBasePath: fixture.scratch,
    use: async (requests) =>
      await fixture.queue.enqueuePreparedAnimaGenerationBatch({
        preflight: async (entries) =>
          await fixture.staging.preflightBatchCapacity({
            entries,
            localProjectKey: localProjectRecoveryKey(fixture.projectPath),
            projectPath: fixture.projectPath,
            stagingSessionId,
          }),
        preparedBatch,
        projectPath: fixture.projectPath,
        requests,
        stagingSessionId,
      }),
  })
  return { items, preparedBatch, stagingSessionId }
}

/** Only dispatch-owned direct result.png files satisfy staging publication. */
export async function animaProvisionalOutput(
  fixture: AnimaStagingFixture,
  options: { bytes?: Buffer; prefix?: string } = {},
): Promise<{ expectedProvisionalRoot: string; provisionalOutputPath: string }> {
  const expectedProvisionalRoot = await mkdtemp(
    path.join(fixture.scratch, options.prefix ?? 'anima-request-'),
  )
  await chmod(expectedProvisionalRoot, 0o700)
  const provisionalOutputPath = path.join(expectedProvisionalRoot, 'result.png')
  await writeFile(provisionalOutputPath, options.bytes ?? fixture.outputBytes, {
    flag: 'wx',
    mode: 0o600,
  })
  return { expectedProvisionalRoot, provisionalOutputPath }
}
