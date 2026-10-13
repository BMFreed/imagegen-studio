import type { PresetDefinition, PresetRecord } from '../../shared/presets/preset-schema.js'

import type { PresetRepository } from './preset-repository.js'

export const PRESET_PURGE_INTERVAL_MS = 60 * 60 * 1000
type Repository = Pick<
  PresetRepository,
  'create' | 'duplicate' | 'get' | 'list' | 'purgeExpired' | 'restore' | 'softDelete' | 'update'
>

export class PresetUnavailableError extends Error {
  readonly code = 'PRESET_UNAVAILABLE'
  constructor() {
    super('The preset service is closing.')
    this.name = 'PresetUnavailableError'
  }
}

/** App lifetime owner: drain accepted operations before SQLite close. */
export class PresetService {
  private cancelTimer: (() => void) | null = null
  private closed = false
  private readonly pending = new Set<Promise<unknown>>()
  private purge: Promise<void> | null = null
  private shutdownOperation: Promise<void> | null = null
  private started = false

  constructor(
    private readonly repository: Repository,
    private readonly options: {
      onCleanupError?: (error: unknown) => void
      schedule?: (callback: () => void) => () => void
    } = {},
  ) {}

  create(definition: PresetDefinition): Promise<PresetRecord> {
    return this.admit(() => this.repository.create(definition))
  }

  duplicate(id: string, name?: string): Promise<PresetRecord> {
    return this.admit(() => this.repository.duplicate(id, name))
  }
  get(id: string, options?: { includeDeleted?: boolean }): Promise<PresetRecord | null> {
    return this.admit(() => this.repository.get(id, options))
  }
  list(options?: { deleted?: boolean }): Promise<PresetRecord[]> {
    return this.admit(() => this.repository.list(options))
  }
  restore(id: string): Promise<PresetRecord> {
    return this.admit(() => this.repository.restore(id))
  }
  shutdown(): Promise<void> {
    if (!this.shutdownOperation) {
      this.closed = true
      this.cancelTimer?.()
      this.cancelTimer = null
      this.shutdownOperation = Promise.allSettled(this.pending).then(() => undefined)
    }
    return this.shutdownOperation
  }
  softDelete(id: string): Promise<PresetRecord> {
    return this.admit(() => this.repository.softDelete(id))
  }
  async start(): Promise<void> {
    if (this.started || this.closed) {
      return
    }
    this.started = true
    await this.cleanup()
    if (this.closed) {
      return
    }
    const callback = () => void this.cleanup()
    if (this.options.schedule) {
      this.cancelTimer = this.options.schedule(callback)
    } else {
      const timer = setInterval(callback, PRESET_PURGE_INTERVAL_MS)
      timer.unref()
      this.cancelTimer = () => clearInterval(timer)
    }
  }

  update(id: string, definition: PresetDefinition): Promise<PresetRecord> {
    return this.admit(() => this.repository.update(id, definition))
  }

  private admit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new PresetUnavailableError())
    }
    let pending: Promise<T>
    try {
      // Capture definition and clock synchronously inside the repository, before await.
      pending = operation()
    } catch (error) {
      pending = Promise.reject(error)
    }
    this.pending.add(pending)
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending),
    )
    return pending
  }

  private cleanup(): Promise<void> {
    if (this.closed) {
      return Promise.resolve()
    }
    if (this.purge) {
      return this.purge
    }
    const operation = this.admit(() => this.repository.purgeExpired()).then(
      () => undefined,
      (error: unknown) => {
        this.options.onCleanupError?.(error)
      },
    )
    this.purge = operation
    void operation.then(() => {
      if (this.purge === operation) {
        this.purge = null
      }
    })
    return operation
  }
}
