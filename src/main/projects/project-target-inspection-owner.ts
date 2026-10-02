import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

import { ProjectWorkerClient, type ProjectWorkerLocation } from './worker-client.js'

export type TargetInspectionWorkerProvider = (
  use: (worker: Pick<ProjectWorkerClient, 'composeTarget'>) => Promise<Mode>,
) => Promise<Mode>
type Mode = ProjectGenerationTargetState['mode']
type Lease = {
  client: ProjectWorkerClient | null
  controller: AbortController
  finish: () => void
  settled: Promise<void>
}

/** One CPU read at a time, including frozen files and exit; newest waiting target/comparison wins. */
export class ProjectTargetInspectionOwner {
  private active: Lease | null = null
  private readonly newest = { comparison: 0, target: 0 }
  private pendingExit: ProjectWorkerClient | null = null
  private stopping = false

  constructor(private readonly location: ProjectWorkerLocation | null) {}

  async read<T>(
    use: (withWorker: TargetInspectionWorkerProvider | undefined) => Promise<T>,
    kind: 'comparison' | 'target' = 'target',
  ): Promise<T | null> {
    if (this.stopping || this.pendingExit) {
      return null
    }
    const request = ++this.newest[kind]
    while (this.active) {
      await this.active.settled
      if (request !== this.newest[kind] || this.stopping || this.pendingExit) {
        return null
      }
    }
    if (this.stopping || this.pendingExit || request !== this.newest[kind]) {
      return null
    }
    let finish!: () => void
    const lease: Lease = {
      client: null,
      controller: new AbortController(),
      finish: () => finish(),
      settled: new Promise<void>((resolve) => {
        finish = resolve
      }),
    }
    this.active = lease
    try {
      return await use(
        this.location
          ? async (callback) => {
              if (this.stopping) {
                return null
              }
              lease.client ??= await ProjectWorkerClient.start(this.location!, {
                environment: { ...process.env, CUDA_VISIBLE_DEVICES: '' },
                signal: lease.controller.signal,
              })
              if (this.stopping) {
                return null
              }
              return await callback(lease.client)
            }
          : undefined,
      )
    } finally {
      try {
        if (lease.client) {
          try {
            await lease.client.close()
          } catch (error) {
            this.pendingExit = lease.client
            throw error
          }
        }
      } finally {
        if (this.active === lease) {
          this.active = null
        }
        lease.finish()
      }
    }
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    const lease = this.active
    lease?.controller.abort()
    await lease?.settled
    if (this.pendingExit) {
      await this.pendingExit.close()
      this.pendingExit = null
    }
    if (!(await ProjectWorkerClient.retryUnconfirmedStartExit())) {
      throw new Error('The image worker has not confirmed exit.')
    }
  }
}
