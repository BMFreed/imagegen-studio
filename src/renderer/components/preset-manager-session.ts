import type { PresetApi, PresetApiResult } from '../../shared/api.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'

import type { PresetProjectCreateIntent } from './project-preset-draft.js'

import {
  type EditablePresetDefinition,
  emptyPresetDefinition,
  presetDefinitionFromRecord,
  validatePresetDefinition,
} from './preset-editor.js'

export type PresetManagerView = 'active' | 'deleted'
export type PresetManagerNavigation =
  | { id: string; kind: 'select' }
  | { kind: 'close' }
  | { kind: 'duplicate' }
  | { kind: 'new' }
  | { kind: 'view'; view: PresetManagerView }

export interface PresetManagerState {
  busy: boolean
  createIntent: PresetProjectCreateIntent | null
  creating: boolean
  draft: EditablePresetDefinition | null
  editorRevision: number
  error: string | null
  loading: boolean
  pending: PresetManagerNavigation | null
  records: PresetRecord[]
  selectedId: string | null
  view: PresetManagerView
}

interface SessionOptions {
  onChange?: (state: PresetManagerState) => void
  onClose?: () => void
  onCloseCanceled?: () => void
}

/** Detached authoring owner. This API never receives a Project or changes resource policy. */
export class PresetManagerSession {
  readonly state: PresetManagerState = {
    busy: false,
    createIntent: null,
    creating: false,
    draft: null,
    editorRevision: 0,
    error: null,
    loading: false,
    pending: null,
    records: [],
    selectedId: null,
    view: 'active',
  }
  get dirty(): boolean {
    return (
      !this.editorValidity ||
      this.state.creating ||
      (this.state.draft !== null &&
        this.baseline !== null &&
        comparable(this.state.draft) !== comparable(this.baseline))
    )
  }
  get isOpen(): boolean {
    return this.opened
  }
  get valid(): boolean {
    return (
      this.editorValidity &&
      this.state.draft !== null &&
      validatePresetDefinition(this.state.draft) !== null
    )
  }
  private baseline: EditablePresetDefinition | null = null
  private editorValidity = true
  private epoch = 0
  private opened = false

  private previousSelectedId: string | null = null

  private previousView: PresetManagerView = 'active'

  private read = 0

  constructor(
    private readonly api: PresetApi,
    private readonly options: SessionOptions = {},
  ) {}

  cancelCreate(): void {
    if (!this.state.creating || this.state.busy) {
      return
    }
    if (this.state.createIntent) {
      this.clearSelection()
      void this.complete({ kind: 'close' })
      this.changed()
      return
    }
    this.state.pending = null
    this.state.view = this.previousView
    this.clearSelection()
    if (this.previousSelectedId) {
      this.select(this.previousSelectedId)
    }
    this.changed()
  }

  cancelPending(): void {
    if (this.state.busy) {
      return
    }
    if (this.state.pending?.kind === 'close') {
      this.options.onCloseCanceled?.()
    }
    this.state.pending = null
    this.changed()
  }

  async discardPending(): Promise<void> {
    if (this.state.busy || !this.state.pending) {
      return
    }
    const pending = this.state.pending
    this.state.pending = null
    this.state.createIntent = null
    this.replaceDraft(this.baseline ? structuredClone(this.baseline) : null)
    this.state.creating = false
    await this.complete(pending)
    this.changed()
  }

  /** Unmount invalidation only; normal user close goes through requestClose(). */
  dispose(): void {
    this.opened = false
    this.epoch += 1
    this.read += 1
    this.state.loading = false
    this.state.createIntent = null
  }

  async duplicate(): Promise<void> {
    if (!this.opened || this.state.view !== 'active' || this.state.creating) {
      return
    }
    if (this.dirty) {
      this.navigate({ kind: 'duplicate' })
      return
    }
    const id = this.state.selectedId
    if (id === null) {
      return
    }
    await this.command(
      () => this.api.duplicate(id),
      (result) => {
        this.upsert(result)
        this.select(result.id)
      },
    )
  }

  async open(initialId?: string): Promise<void> {
    if (this.state.busy) {
      return
    }
    this.opened = true
    this.epoch += 1
    const epoch = this.epoch
    this.state.view = 'active'
    this.state.error = null
    this.state.pending = null
    this.clearSelection()
    await this.reload()
    if (this.opened && this.epoch === epoch && !this.state.error && !this.state.draft) {
      const record = this.state.records.find(
        (candidate) =>
          candidate.deletedAt === null && (initialId === undefined || candidate.id === initialId),
      )
      if (record) {
        this.select(record.id)
      }
    }
  }

  /** Capture the visible Project synchronously; catalog responses cannot replace this draft. */
  async openCreate(intent: PresetProjectCreateIntent): Promise<void> {
    if (this.state.busy) {
      return
    }
    const captured = JSON.parse(JSON.stringify(intent)) as PresetProjectCreateIntent
    this.opened = true
    this.epoch += 1
    this.state.view = 'active'
    this.state.error = null
    this.state.pending = null
    this.clearSelection()
    this.state.createIntent = captured
    this.state.creating = true
    this.replaceDraft(JSON.parse(JSON.stringify(captured.definition)) as EditablePresetDefinition)
    this.changed()
    await this.reload()
  }

  async reload(): Promise<void> {
    if (!this.opened || this.state.busy) {
      return
    }
    const epoch = this.epoch
    const read = ++this.read
    const current = () => this.opened && this.epoch === epoch && this.read === read
    this.state.loading = true
    this.state.error = null
    this.changed()
    try {
      const [active, deleted] = await Promise.all([
        this.api.list(),
        this.api.list({ deleted: true }),
      ])
      if (!current()) {
        return
      }
      this.state.records = [...value(active), ...value(deleted)]
      const selected = this.selectedRecord()
      if (
        !this.dirty &&
        this.state.selectedId !== null &&
        (!selected || (selected.deletedAt !== null) !== (this.state.view === 'deleted'))
      ) {
        this.clearSelection()
      }
    } catch (error) {
      if (current()) {
        this.state.error = errorMessage(error)
      }
    } finally {
      if (current()) {
        this.state.loading = false
        this.changed()
      }
    }
  }

  requestClose(): boolean {
    this.navigate({ kind: 'close' })
    return !this.opened
  }

  requestNew(): void {
    if (this.state.creating && !this.state.createIntent) {
      return
    }
    this.navigate({ kind: 'new' })
  }

  requestSelect(id: string): void {
    if (this.state.selectedId === id && !this.state.creating) {
      return
    }
    const record = this.state.records.find((candidate) => candidate.id === id)
    if (!record || (record.deletedAt !== null) !== (this.state.view === 'deleted')) {
      return
    }
    this.navigate({ id, kind: 'select' })
  }

  requestView(view: PresetManagerView): void {
    if (view !== this.state.view) {
      this.navigate({ kind: 'view', view })
    }
  }

  async restore(): Promise<void> {
    if (!this.opened || this.state.view !== 'deleted') {
      return
    }
    const id = this.state.selectedId
    if (id === null) {
      return
    }
    await this.command(
      () => this.api.restore(id),
      (result) => {
        this.upsert(result)
        this.state.view = 'active'
        this.select(result.id)
      },
    )
  }

  async save(): Promise<void> {
    if (!this.opened || this.state.view !== 'active' || !this.state.draft || !this.editorValidity) {
      return
    }
    const definition = validatePresetDefinition(this.state.draft)
    if (!definition || !this.dirty) {
      return
    }
    const creating = this.state.creating
    const id = this.state.selectedId
    if (!creating && id === null) {
      return
    }
    const result = await this.command(
      () => (creating ? this.api.create(definition) : this.api.update(id!, definition)),
      (saved) => {
        this.upsert(saved)
        this.select(saved.id, false)
      },
    )
    if (!result) {
      return
    }
    const pending = this.state.pending
    this.state.pending = null
    if (pending) {
      await this.complete(pending)
    }
    this.changed()
  }

  /** Raw input such as '-' can be invalid even while Naive retains its previous model number. */
  setEditorValidity(valid: boolean): void {
    if (this.editorValidity === valid) {
      return
    }
    this.editorValidity = valid
    this.changed()
  }

  /** The view owns the destructive confirmation; the repository owns the 30-day clock. */
  async softDelete(): Promise<void> {
    if (!this.opened || this.state.view !== 'active' || this.state.creating) {
      return
    }
    const id = this.state.selectedId
    if (id === null) {
      return
    }
    await this.command(
      () => this.api.softDelete(id),
      (result) => {
        this.upsert(result)
        this.clearSelection()
      },
    )
  }

  private changed(): void {
    this.options.onChange?.({ ...this.state })
  }

  private clearSelection(): void {
    this.state.selectedId = null
    this.state.creating = false
    this.state.createIntent = null
    this.replaceDraft(null)
    this.baseline = null
  }

  private async command<T>(
    action: () => Promise<PresetApiResult<T>>,
    commit: (result: T) => void,
  ): Promise<T | null> {
    if (!this.opened || this.state.busy) {
      return null
    }
    const epoch = this.epoch
    this.read += 1
    this.state.loading = false
    this.state.busy = true
    this.state.error = null
    this.changed()
    try {
      const result = value(await action())
      if (!this.opened || this.epoch !== epoch) {
        return null
      }
      // Publish idle only after the returned persisted state replaced the old editor snapshot.
      commit(result)
      return result
    } catch (error) {
      if (this.opened && this.epoch === epoch) {
        this.state.error = errorMessage(error)
      }
      return null
    } finally {
      this.state.busy = false
      if (this.opened && this.epoch === epoch) {
        this.changed()
      }
    }
  }

  private async complete(pending: PresetManagerNavigation): Promise<void> {
    switch (pending.kind) {
      case 'close': {
        this.dispose()
        this.state.pending = null
        this.options.onClose?.()
        break
      }
      case 'duplicate': {
        await this.duplicate()
        break
      }
      case 'new': {
        this.previousSelectedId = this.state.selectedId
        this.previousView = this.state.view
        this.clearSelection()
        this.state.view = 'active'
        this.state.creating = true
        this.replaceDraft(emptyPresetDefinition())
        break
      }
      case 'select': {
        this.select(pending.id)
        break
      }
      case 'view': {
        this.state.view = pending.view
        this.clearSelection()
        break
      }
    }
  }

  private navigate(pending: PresetManagerNavigation): void {
    if (!this.opened || this.state.busy) {
      return
    }
    if (this.dirty) {
      this.state.pending = pending
    } else {
      void this.complete(pending)
    }
    this.changed()
  }

  private replaceDraft(draft: EditablePresetDefinition | null, resetEditor = true): void {
    this.state.draft = draft
    this.editorValidity = true
    if (resetEditor) {
      this.state.editorRevision += 1
    }
  }

  private select(id: string, resetEditor = true): void {
    const record = this.state.records.find((candidate) => candidate.id === id)
    if (!record || (record.deletedAt !== null) !== (this.state.view === 'deleted')) {
      this.clearSelection()
      return
    }
    this.state.selectedId = record.id
    this.state.creating = false
    this.state.createIntent = null
    this.baseline = presetDefinitionFromRecord(record)
    this.replaceDraft(
      record.deletedAt === null ? presetDefinitionFromRecord(record) : null,
      resetEditor,
    )
    this.changed()
  }

  private selectedRecord(): PresetRecord | undefined {
    return this.state.records.find((record) => record.id === this.state.selectedId)
  }

  private upsert(record: PresetRecord): void {
    this.state.records = [record, ...this.state.records.filter((item) => item.id !== record.id)]
  }
}

function value<T>(result: PresetApiResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`)
  }
  return result.value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Preset action failed.'
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  )
}
