import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

import {
  ProjectWorkerClient,
  ProjectWorkerError,
  type ProjectWorkerLocation,
} from './worker-client.js'

export type TargetInspectionWorkerProvider = (
  use: (worker: Pick<ProjectWorkerClient, 'composeTarget'>) => Promise<Mode>,
) => Promise<Mode>
export interface ProjectImageWorkerSource {
  environment: NodeJS.ProcessEnv
  location: ProjectWorkerLocation
}
export type ProjectImageWorkerSourceProvider = () => Promise<ProjectImageWorkerSource | null>

type Mode = ProjectGenerationTargetState['mode']

type Lease = {
  client: ProjectWorkerClient | null
  controller: AbortController
  finish: () => void
  settled: Promise<void>
}

/** One CPU action/read through cleanup and exit; newest waiting target/comparison wins. */
export class ProjectTargetInspectionOwner {
  private active: Lease | null = null
  private readonly newest = { comparison: 0, target: 0 }
  private pendingExit: ProjectWorkerClient | null = null
  private stopping = false

  constructor(
    private readonly source: ProjectImageWorkerSourceProvider | ProjectWorkerLocation | null,
  ) {}

  async read<T>(
    use: (withWorker: TargetInspectionWorkerProvider | undefined) => Promise<T>,
    kind: 'comparison' | 'target' = 'target',
  ): Promise<T | null> {
    const request = ++this.newest[kind]
    return await this.withLease(
      async (lease, source) =>
        await use(
          source
            ? async (callback) => {
                const client = await this.start(lease, source)
                return client ? await callback(client) : null
              }
            : undefined,
        ),
      () => request === this.newest[kind],
    )
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

  /** Save stays within the close barrier when startup fails or only placeholders are usable. */
  async useOptionalWorker<T>(
    use: (worker: ProjectWorkerClient | undefined) => Promise<T>,
  ): Promise<T | null> {
    return await this.withLease(
      async (lease, source) => {
        let client: ProjectWorkerClient | null = null
        if (source) {
          try {
            client = await this.start(lease, source)
          } catch (error) {
            if (!(error instanceof ProjectWorkerError)) {
              throw error
            }
          }
        }
        return await use(client ?? undefined)
      },
      () => true,
      true,
      true,
    )
  }

  /** Save/import/rebuild retain their action instead of being superseded by a newer inspection. */
  async useWorker<T>(
    use: (worker: ProjectWorkerClient) => Promise<T>,
    options: { retainCompletedResult?: boolean } = {},
  ): Promise<T | null> {
    return await this.withLease(
      async (lease, source) => {
        if (!source) {
          return null
        }
        const client = await this.start(lease, source)
        return client ? await use(client) : null
      },
      () => true,
      options.retainCompletedResult !== false,
    )
  }

  private async start(
    lease: Lease,
    source: ProjectImageWorkerSource,
  ): Promise<ProjectWorkerClient | null> {
    if (this.stopping) {
      return null
    }
    lease.client ??= await ProjectWorkerClient.start(source.location, {
      environment: { ...source.environment, CUDA_VISIBLE_DEVICES: '' },
      signal: lease.controller.signal,
    })
    return this.stopping ? null : lease.client
  }

  private async withLease<T>(
    use: (lease: Lease, source: ProjectImageWorkerSource | null) => Promise<T>,
    current: () => boolean = () => true,
    retainCompletedResult = false,
    allowWithoutWorker = false,
  ): Promise<T | null> {
    if (this.stopping || (this.pendingExit && !allowWithoutWorker)) {
      return null
    }
    while (this.active) {
      await this.active.settled
      if (!current() || this.stopping || (this.pendingExit && !allowWithoutWorker)) {
        return null
      }
    }
    if (this.stopping || (this.pendingExit && !allowWithoutWorker) || !current()) {
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
    let completed = false
    try {
      const source = this.pendingExit
        ? null
        : typeof this.source === 'function'
          ? await this.source()
          : this.source
            ? { environment: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, location: this.source }
            : null
      if (this.stopping || !current()) {
        return null
      }
      const result = await use(lease, source)
      completed = true
      return result
    } finally {
      try {
        if (lease.client) {
          try {
            await lease.client.close()
          } catch (error) {
            this.pendingExit = lease.client
            // A completed Save/import/rebuild already changed durable state. Preserve that outcome
            // while retaining the child fence; shutdown must still retry and confirm its exit.
            if (!completed || !retainCompletedResult) {
              throw error
            }
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
}
