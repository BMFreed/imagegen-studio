<script setup lang="ts">
import type { ProjectRegionalGuidanceLayerView, ProjectTab } from '../../shared/api.js'
import type { LoraTriggerSource } from '../../shared/projects/lora-triggers.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import type {
  PromptEmbeddingSelection,
  PromptEmbeddingSource,
} from '../../shared/projects/prompt-embeddings.js'
import type {
  ProjectRegionalGuidanceChange,
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
  ProjectRegionalGuidanceReferenceImageChange,
} from '../../shared/projects/regional-guidance.js'

import { Plus, X } from '@vicons/tabler'
import { NButton, NFormItem, NIcon, NInput, NModal, NSwitch } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import PlainPromptEditor from './PlainPromptEditor.vue'
import { provideProjectEntityRow } from './project-entity-row.js'
import ProjectEntitySurface from './ProjectEntitySurface.vue'
import ProjectRegionalReferenceImages from './ProjectRegionalReferenceImages.vue'

const props = defineProps<{
  currentCanvasDraft?: ProjectTab['generationDraft']
  disabled: boolean
  documentId: string
  documentRevision: string
  embeddingCatalogReady: boolean
  embeddingSources: PromptEmbeddingSource[]
  loraSources: LoraTriggerSource[]
  metadataDisabled?: boolean
  promptHistoryEpoch?: number
  promptInputBlocked?: boolean
  region: ProjectRegionalGuidanceLayerView
  selected: boolean
}>()
const emit = defineEmits<{
  delete: [owner: ProjectRegionalGuidanceOwner]
  duplicate: [owner: ProjectRegionalGuidanceOwner]
  importReferenceImage: [owner: ProjectRegionalGuidanceOwner]
  sealPromptHistory: [owner: ProjectRegionalGuidanceOwner, historyGroupId: string]
  select: [regionId: string]
  update: [owner: ProjectRegionalGuidanceOwner, change: ProjectRegionalGuidanceChange]
  updatePrompt: [owner: ProjectRegionalGuidanceOwner, change: ProjectRegionalGuidancePromptChange]
  updateReferenceImage: [
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceReferenceImageChange,
  ]
}>()
const referenceDescriptionId = useId()
const failedMaskPreviewUrl = ref<string | null>(null)
const renameInputId = useId()
const renameOpen = ref(false)
const renameValue = ref('')
const renameOwner = shallowRef<ProjectRegionalGuidanceOwner | null>(null)
const entitySurface = ref<InstanceType<typeof ProjectEntitySurface> | null>(null)
const inheritedNegativeId = useId()
const negativeSourceId = useId()
const promptPolarities = ['positive', 'negative'] as const
type PromptPolarity = (typeof promptPolarities)[number]
const promptEditors: Partial<Record<PromptPolarity, InstanceType<typeof PlainPromptEditor>>> = {}
const promptGroups = new Map<
  PromptPolarity,
  { historyGroupId: string; owner: ProjectRegionalGuidanceOwner }
>()
const promptEditingDisabled = computed(
  () =>
    props.disabled || props.region.locked || props.promptInputBlocked || !props.currentCanvasDraft,
)
const useGlobalNegative = computed(() => props.region.prompts?.useGlobalNegativePrompt ?? true)
const metadataEditingDisabled = computed(() => props.disabled || Boolean(props.metadataDisabled))
const currentCanvasFamily = computed(() => props.currentCanvasDraft?.model?.baseModelFamily ?? null)
const referenceEditingDisabled = computed(
  () => metadataEditingDisabled.value || Boolean(props.promptInputBlocked) || props.region.locked,
)
const referenceImportDisabled = computed(
  () => referenceEditingDisabled.value || currentCanvasFamily.value !== 'illustrious',
)
const referenceDescription = computed(() => {
  if (currentCanvasFamily.value === 'anima') {
    if (props.region.referenceImages?.length) {
      return props.region.enabled
        ? 'Anima does not support regional reference images. Remove the images, disable the region, or choose an Illustrious model before generating.'
        : 'Anima does not support regional reference images. These images are retained; this disabled region does not affect generation.'
    }
    return 'Regional reference images are not supported by Anima. Choose an Illustrious model to add an image.'
  }
  return currentCanvasFamily.value === 'illustrious'
    ? null
    : 'Choose an Illustrious model in Current Canvas to add a regional reference image.'
})
let referenceImportFocus: {
  completed: boolean
  context: string
  document: Document
  owner: ProjectRegionalGuidanceOwner
  references: string[]
  revision: string
  selected: boolean
  surface: HTMLElement
  target: HTMLButtonElement
} | null = null
let promptFocusEpoch = 0
let promptFocusIntent: {
  anchor: Element | null
  baseline: string
  document: Document
  epoch: number
  expected: string
  metadata: string
  owner: ProjectRegionalGuidanceOwner
  polarity: PromptPolarity
  present: boolean
  selected: boolean
  surface: HTMLElement
} | null = null
let disposed = false
let renameFocusEpoch = 0
let renameFocusDocument: Document | null = null
let renameReturnFocus: {
  epoch: number
  expectedName: string | null
  left: boolean
  name: string
  owner: ProjectRegionalGuidanceOwner
  regionState: string
  restoreScheduled: boolean
  selected: boolean
  submission: 'busy' | 'none' | 'pending' | 'settled'
  surface: HTMLElement
  target: HTMLButtonElement
} | null = null
const renameError = computed(() => {
  if (!renameValue.value.trim()) {
    return 'Enter a region name.'
  }
  return new TextEncoder().encode(renameValue.value).byteLength > IGS_SAFETY_CEILINGS.titleBytes
    ? 'Use a name of at most 1024 UTF-8 bytes.'
    : null
})

function currentOwner(): ProjectRegionalGuidanceOwner {
  return {
    documentId: props.documentId,
    documentRevision: props.documentRevision,
    regionId: props.region.id,
  }
}

function ownerIsCurrent(owner: ProjectRegionalGuidanceOwner): boolean {
  return (
    owner.documentId === props.documentId &&
    owner.documentRevision === props.documentRevision &&
    owner.regionId === props.region.id
  )
}

function referenceImportContext(): string {
  const { enabled, locked, mask, name, overlayOpacity, prompts } = props.region
  return JSON.stringify([
    enabled,
    locked,
    mask,
    name,
    overlayOpacity,
    prompts,
    props.currentCanvasDraft,
  ])
}

function referenceImageStates(): string[] {
  return (props.region.referenceImages ?? []).map(({ thumbnailUrl: _thumbnailUrl, ...stored }) =>
    JSON.stringify(stored),
  )
}

function invalidateReferenceImportFocus() {
  referenceImportFocus?.document.removeEventListener('focusin', onReferenceImportFocusMove, true)
  referenceImportFocus = null
}

function onReferenceImportFocusMove(event: FocusEvent) {
  const intent = referenceImportFocus
  if (
    intent &&
    event.target !== intent.target &&
    event.target !== intent.document.body &&
    event.target !== intent.document.documentElement
  ) {
    invalidateReferenceImportFocus()
  }
}

function referenceImportFocusIsCurrent(): boolean {
  const intent = referenceImportFocus
  if (!intent) {
    return false
  }
  if (
    disposed ||
    intent.owner.documentId !== props.documentId ||
    intent.owner.regionId !== props.region.id ||
    intent.selected !== props.selected ||
    intent.context !== referenceImportContext() ||
    entitySurface.value?.$el !== intent.surface
  ) {
    invalidateReferenceImportFocus()
    return false
  }
  const references = referenceImageStates()
  if (props.documentRevision === intent.revision) {
    if (JSON.stringify(references) !== JSON.stringify(intent.references)) {
      invalidateReferenceImportFocus()
      return false
    }
  } else if (
    intent.revision === intent.owner.documentRevision &&
    references.length === intent.references.length + 1 &&
    intent.references.every((reference, index) => references[index] === reference)
  ) {
    // Only this import's one appended attachment may advance the captured focus revision.
    intent.references = references
    intent.revision = props.documentRevision
  } else {
    invalidateReferenceImportFocus()
    return false
  }
  return true
}

function queueReferenceImportFocus() {
  const intent = referenceImportFocus
  if (!intent?.completed || !referenceImportFocusIsCurrent()) {
    return
  }
  void nextTick(() => {
    if (referenceImportFocus !== intent || !referenceImportFocusIsCurrent()) {
      return
    }
    const target = intent.target
    if (
      !target.isConnected ||
      !intent.surface.contains(target) ||
      intent.surface.querySelector('button[data-regional-reference-import]') !== target ||
      target.closest('[hidden], [inert], [aria-hidden="true"]') ||
      target.getClientRects().length === 0
    ) {
      invalidateReferenceImportFocus()
      return
    }
    const active = intent.document.activeElement
    if (
      active &&
      active !== target &&
      active !== intent.document.body &&
      active !== intent.document.documentElement
    ) {
      invalidateReferenceImportFocus()
      return
    }
    if (referenceImportDisabled.value || target.disabled) {
      invalidateReferenceImportFocus()
      return
    }
    invalidateReferenceImportFocus()
    target.focus({ preventScroll: true })
  })
}

/** Called by the import action owner after its exact request settles and releases busy state. */
function focusRegionalReferenceImport(owner: ProjectRegionalGuidanceOwner) {
  const intent = referenceImportFocus
  if (
    !intent ||
    owner.documentId !== intent.owner.documentId ||
    owner.documentRevision !== intent.owner.documentRevision ||
    owner.regionId !== intent.owner.regionId
  ) {
    return
  }
  intent.completed = true
  queueReferenceImportFocus()
}

function importReferenceImage() {
  if (referenceImportDisabled.value) {
    return
  }
  invalidateReferenceImportFocus()
  const owner = currentOwner()
  const surface = entitySurface.value?.$el
  const target =
    surface instanceof HTMLElement
      ? surface.querySelector<HTMLButtonElement>('button[data-regional-reference-import]')
      : null
  if (target) {
    const document = target.ownerDocument
    referenceImportFocus = {
      completed: false,
      context: referenceImportContext(),
      document,
      owner,
      references: referenceImageStates(),
      revision: owner.documentRevision,
      selected: props.selected,
      surface,
      target,
    }
    document.addEventListener('focusin', onReferenceImportFocusMove, true)
  }
  emit('importReferenceImage', owner)
}

function updateReferenceImage(change: ProjectRegionalGuidanceReferenceImageChange) {
  if (!referenceEditingDisabled.value) {
    emit('updateReferenceImage', currentOwner(), change)
  }
}

watch(
  [
    () => props.documentId,
    () => props.documentRevision,
    () => props.region.id,
    () => props.selected,
    referenceImportContext,
    referenceImageStates,
    referenceImportDisabled,
  ],
  () => {
    if (referenceImportFocusIsCurrent()) {
      queueReferenceImportFocus()
    }
  },
  { flush: 'post' },
)

defineExpose({ focusRegionalReferenceImport })

function regionFocusState(): string {
  const { enabled, locked, mask, overlayOpacity, prompts } = props.region
  return JSON.stringify([
    enabled,
    locked,
    overlayOpacity,
    mask.id,
    mask.revision,
    mask.asset,
    prompts,
    referenceImageStates(),
    props.metadataDisabled,
  ])
}

function setPromptEditor(polarity: PromptPolarity, instance: unknown) {
  if (instance) {
    promptEditors[polarity] = instance as InstanceType<typeof PlainPromptEditor>
  } else {
    delete promptEditors[polarity]
  }
}

function beginPromptEdit(polarity: PromptPolarity): string | undefined {
  if (
    promptEditingDisabled.value ||
    !props.region.prompts?.[polarity] ||
    (polarity === 'negative' && useGlobalNegative.value)
  ) {
    return
  }
  let group = promptGroups.get(polarity)
  if (!group) {
    group = {
      historyGroupId: `regional:${props.region.id}:${polarity}:${crypto.randomUUID()}`,
      owner: currentOwner(),
    }
    promptGroups.set(polarity, group)
  }
  return group.historyGroupId
}

function endPromptEdit(polarity: PromptPolarity) {
  const group = promptGroups.get(polarity)
  if (!group) {
    return
  }
  promptGroups.delete(polarity)
  if (group.owner.documentId === props.documentId && group.owner.regionId === props.region.id) {
    emit('sealPromptHistory', currentOwner(), group.historyGroupId)
  }
}

function updatePrompt(
  polarity: PromptPolarity,
  text: string,
  embeddingSelection?: PromptEmbeddingSelection,
) {
  const historyGroupId = beginPromptEdit(polarity)
  if (historyGroupId) {
    emit('updatePrompt', currentOwner(), {
      ...(embeddingSelection ? { embeddingSelection: { ...embeddingSelection } } : {}),
      historyGroupId,
      kind: 'text',
      polarity,
      text,
    })
  }
}

function promptState(
  prompts: ProjectRegionalGuidanceLayerView['prompts'] = props.region.prompts,
): string {
  return JSON.stringify([
    prompts?.positive ?? null,
    prompts?.negative ?? null,
    prompts?.useGlobalNegativePrompt ?? true,
  ])
}

function promptMetadata(): string {
  const { enabled, id, locked, mask, name, overlayOpacity } = props.region
  return JSON.stringify([id, name, enabled, locked, mask, overlayOpacity, referenceImageStates()])
}

function invalidatePromptFocus() {
  promptFocusIntent?.document.removeEventListener('focusin', onPromptFocusMove, true)
  promptFocusIntent = null
  promptFocusEpoch += 1
}

function onPromptFocusMove(event: FocusEvent) {
  const intent = promptFocusIntent
  if (
    intent &&
    event.target !== intent.anchor &&
    event.target !== intent.document.body &&
    event.target !== intent.document.documentElement
  ) {
    invalidatePromptFocus()
  }
}

function queuePromptFocus() {
  const intent = promptFocusIntent
  if (!intent) {
    return
  }
  const sameContext =
    !disposed &&
    !promptEditingDisabled.value &&
    intent.owner.documentId === props.documentId &&
    intent.owner.regionId === props.region.id &&
    intent.selected === props.selected &&
    intent.metadata === promptMetadata() &&
    entitySurface.value?.$el === intent.surface
  const state = promptState()
  if (!sameContext) {
    invalidatePromptFocus()
    return
  }
  if (state !== intent.expected) {
    if (state !== intent.baseline || !ownerIsCurrent(intent.owner)) {
      invalidatePromptFocus()
    }
    return
  }
  // Only the exact requested block transition may advance this focus intent's revision.
  intent.owner = currentOwner()
  void nextTick(() => {
    if (
      promptFocusIntent !== intent ||
      promptFocusEpoch !== intent.epoch ||
      !ownerIsCurrent(intent.owner) ||
      promptEditingDisabled.value ||
      props.selected !== intent.selected ||
      promptMetadata() !== intent.metadata ||
      promptState() !== intent.expected ||
      entitySurface.value?.$el !== intent.surface ||
      !intent.surface.isConnected ||
      intent.surface.closest('[hidden], [inert], [aria-hidden="true"]') ||
      intent.surface.getClientRects().length === 0
    ) {
      if (promptFocusIntent === intent) {
        invalidatePromptFocus()
      }
      return
    }
    const active = intent.document.activeElement
    if (
      active &&
      active !== intent.anchor &&
      active !== intent.document.body &&
      active !== intent.document.documentElement
    ) {
      invalidatePromptFocus()
      return
    }
    const add = intent.surface.querySelector<HTMLButtonElement>(
      `button[data-regional-add-polarity="${intent.polarity}"]`,
    )
    const editor = promptEditors[intent.polarity]
    invalidatePromptFocus()
    if (intent.present) {
      editor?.focus()
    } else if (add && !add.disabled && add.getClientRects().length > 0) {
      add.focus({ preventScroll: true })
    }
  })
}

function changePromptBlock(polarity: PromptPolarity, present: boolean) {
  if (promptEditingDisabled.value || Boolean(props.region.prompts?.[polarity]) === present) {
    return
  }
  endPromptEdit(polarity)
  invalidatePromptFocus()
  const prompts = {
    negative: props.region.prompts?.negative ?? null,
    positive: props.region.prompts?.positive ?? null,
    useGlobalNegativePrompt: useGlobalNegative.value,
  }
  prompts[polarity] = present ? { embeddingRefs: [], text: '' } : null
  if (polarity === 'negative') {
    prompts.useGlobalNegativePrompt = !present
  }
  const surface = entitySurface.value?.$el
  if (surface instanceof HTMLElement) {
    const document = surface.ownerDocument
    promptFocusIntent = {
      anchor: document.activeElement,
      baseline: promptState(),
      document,
      epoch: promptFocusEpoch,
      expected: promptState(prompts),
      metadata: promptMetadata(),
      owner: currentOwner(),
      polarity,
      present,
      selected: props.selected,
      surface,
    }
    document.addEventListener('focusin', onPromptFocusMove, true)
  }
  emit('updatePrompt', currentOwner(), { kind: 'block', polarity, present })
  queuePromptFocus()
}

function changeNegativeSource(useGlobalNegativePrompt: boolean) {
  if (
    promptEditingDisabled.value ||
    !props.region.prompts?.negative ||
    useGlobalNegativePrompt === useGlobalNegative.value
  ) {
    return
  }
  endPromptEdit('negative')
  invalidatePromptFocus()
  emit('updatePrompt', currentOwner(), { kind: 'negative-source', useGlobalNegativePrompt })
}

watch(
  [() => props.documentId, () => props.region.id],
  () => {
    promptGroups.clear()
    invalidatePromptFocus()
  },
  { flush: 'sync' },
)
watch(
  () => props.promptHistoryEpoch,
  () => promptGroups.clear(),
  { flush: 'sync' },
)
watch(
  [
    promptEditingDisabled,
    useGlobalNegative,
    () => Boolean(props.region.prompts?.positive),
    () => Boolean(props.region.prompts?.negative),
  ],
  () => {
    for (const polarity of promptPolarities) {
      if (
        promptEditingDisabled.value ||
        !props.region.prompts?.[polarity] ||
        (polarity === 'negative' && useGlobalNegative.value)
      ) {
        endPromptEdit(polarity)
      }
    }
  },
  { flush: 'sync' },
)
watch(
  [
    () => props.documentId,
    () => props.documentRevision,
    () => props.selected,
    promptEditingDisabled,
    promptMetadata,
    promptState,
  ],
  queuePromptFocus,
  { flush: 'post' },
)

function invalidateRenameFocus() {
  stopTrackingRenameFocus()
  renameFocusEpoch += 1
  renameReturnFocus = null
}

function cancelRename() {
  renameOpen.value = false
  renameOwner.value = null
}

function openRename() {
  if (metadataEditingDisabled.value || props.region.locked) {
    return
  }
  invalidateRenameFocus()
  invalidateReferenceImportFocus()
  const surface = entitySurface.value?.$el
  const target =
    surface instanceof HTMLElement
      ? surface.querySelector<HTMLButtonElement>('button[data-entity-menu-trigger]')
      : null
  if (target) {
    renameReturnFocus = {
      epoch: renameFocusEpoch,
      expectedName: null,
      left: false,
      name: props.region.name,
      owner: currentOwner(),
      regionState: regionFocusState(),
      restoreScheduled: false,
      selected: props.selected,
      submission: 'none',
      surface,
      target,
    }
  }
  renameValue.value = props.region.name
  renameOwner.value = currentOwner()
  renameOpen.value = true
}

function commitRename(): boolean {
  const owner = renameOwner.value
  if (
    !owner ||
    !ownerIsCurrent(owner) ||
    metadataEditingDisabled.value ||
    props.region.locked ||
    renameError.value
  ) {
    return false
  }
  const name = renameValue.value
  if (renameReturnFocus && name !== props.region.name) {
    renameReturnFocus.expectedName = name
    renameReturnFocus.submission = 'pending'
  }
  cancelRename()
  if (name !== props.region.name) {
    emit('update', owner, { kind: 'rename', name })
  }
  return true
}

function renameOnEnter(event: KeyboardEvent) {
  if (!event.isComposing) {
    commitRename()
  }
}

function stopTrackingRenameFocus() {
  renameFocusDocument?.removeEventListener('focusin', onRenameFocusMove, true)
  renameFocusDocument = null
}

function onRenameFocusMove(event: FocusEvent) {
  const intent = renameReturnFocus
  const document = renameFocusDocument
  if (
    intent?.left &&
    document &&
    event.target !== intent.target &&
    event.target !== document.body &&
    event.target !== document.documentElement
  ) {
    invalidateRenameFocus()
  }
}

function trackRenameFocus(document: Document) {
  if (renameFocusDocument === document) {
    return
  }
  stopTrackingRenameFocus()
  renameFocusDocument = document
  document.addEventListener('focusin', onRenameFocusMove, true)
}

function queueRenameFocusRestore() {
  const intent = renameReturnFocus
  if (!intent || !intent.left || intent.restoreScheduled) {
    return
  }
  intent.restoreScheduled = true
  // Let afterLeave's final DOM cleanup and any acknowledged props settle before reading focus.
  void nextTick(() => {
    intent.restoreScheduled = false
    if (renameReturnFocus !== intent || renameFocusEpoch !== intent.epoch) {
      return
    }
    if (
      disposed ||
      renameOpen.value ||
      !ownerIsCurrent(intent.owner) ||
      props.region.locked ||
      props.region.name !== intent.name ||
      props.selected !== intent.selected ||
      regionFocusState() !== intent.regionState
    ) {
      invalidateRenameFocus()
      return
    }
    const surface = entitySurface.value?.$el
    const target = intent.target
    if (
      surface !== intent.surface ||
      !target.isConnected ||
      !intent.surface.contains(target) ||
      intent.surface.querySelector('button[data-entity-menu-trigger]') !== target ||
      target.closest('[hidden], [inert], [aria-hidden="true"]') ||
      target.getClientRects().length === 0
    ) {
      invalidateRenameFocus()
      return
    }
    const document = target.ownerDocument
    const focused = document.activeElement
    if (
      focused &&
      focused !== document.body &&
      focused !== document.documentElement &&
      focused !== target
    ) {
      invalidateRenameFocus()
      return
    }
    // A user who leaves this interaction while IPC is pending owns the next focus destination.
    trackRenameFocus(document)
    if (
      intent.expectedName !== null ||
      props.disabled ||
      (intent.submission !== 'none' && intent.submission !== 'settled')
    ) {
      return
    }
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
      invalidateRenameFocus()
      return
    }
    invalidateRenameFocus()
    target.focus({ preventScroll: true })
  })
}

function restoreRenameFocus() {
  if (renameOpen.value || !renameReturnFocus) {
    return
  }
  renameReturnFocus.left = true
  queueRenameFocusRestore()
}

watch(
  [
    () => props.documentId,
    () => props.documentRevision,
    () => props.region.id,
    () => props.region.name,
    () => props.region.locked,
    () => props.disabled,
    () => props.selected,
    regionFocusState,
  ],
  () => {
    const intent = renameReturnFocus
    if (!intent) {
      invalidateRenameFocus()
      cancelRename()
      return
    }
    if (intent.submission === 'pending' && props.disabled) {
      intent.submission = 'busy'
    } else if (intent.submission === 'busy' && !props.disabled) {
      intent.submission = 'settled'
    }
    const sameContext =
      intent.owner.documentId === props.documentId &&
      intent.owner.regionId === props.region.id &&
      intent.selected === props.selected &&
      intent.regionState === regionFocusState()
    if (
      !renameOpen.value &&
      intent.expectedName !== null &&
      sameContext &&
      props.region.name === intent.expectedName &&
      props.documentRevision !== intent.owner.documentRevision
    ) {
      // Accept this rename's matching acknowledgement once, not a later document revision.
      intent.owner = currentOwner()
      intent.name = props.region.name
      intent.expectedName = null
    } else if (
      intent.expectedName !== null &&
      intent.submission === 'settled' &&
      !props.disabled &&
      sameContext &&
      ownerIsCurrent(intent.owner) &&
      props.region.name === intent.name
    ) {
      // A refused/failed request may finish with the original document untouched.
      intent.expectedName = null
    } else if (
      !sameContext ||
      !ownerIsCurrent(intent.owner) ||
      intent.name !== props.region.name ||
      (props.disabled && (intent.submission === 'none' || intent.submission === 'settled'))
    ) {
      invalidateRenameFocus()
    }
    cancelRename()
    queueRenameFocusRestore()
  },
  { flush: 'post' },
)
watch(renameOpen, (open) => {
  if (!open) {
    renameOwner.value = null
  }
})
onBeforeUnmount(() => {
  disposed = true
  promptGroups.clear()
  invalidatePromptFocus()
  invalidateRenameFocus()
  invalidateReferenceImportFocus()
})

provideProjectEntityRow({
  menu: computed(() => [
    {
      disabled: metadataEditingDisabled.value || props.region.locked,
      key: 'rename',
      label: 'Rename region',
      run: openRename,
    },
    {
      disabled: metadataEditingDisabled.value || props.region.locked,
      key: 'duplicate',
      label: 'Duplicate region',
      run: () => emit('duplicate', currentOwner()),
    },
    {
      disabled: metadataEditingDisabled.value || props.region.locked,
      key: 'delete',
      label: 'Delete region',
      run: () => emit('delete', currentOwner()),
    },
  ]),
  select: () => {
    if (!metadataEditingDisabled.value) {
      emit('select', props.region.id)
    }
  },
  state: computed(() => ({
    disabled: metadataEditingDisabled.value,
    locked: props.region.locked,
    name: props.region.name,
    selected: props.selected,
    summary: `${props.region.mask.asset ? 'Painted mask' : 'Empty mask'} · ${props.region.enabled ? 'Enabled' : 'Disabled'}`,
    visible: props.region.enabled,
  })),
  toggleLock: () => {
    if (!metadataEditingDisabled.value) {
      emit('update', currentOwner(), { kind: 'lock', locked: !props.region.locked })
    }
  },
  toggleVisible: () => {
    if (!metadataEditingDisabled.value) {
      emit('update', currentOwner(), { enabled: !props.region.enabled, kind: 'enabled' })
    }
  },
})
</script>

<template>
  <ProjectEntitySurface
    ref="entitySurface"
    class="regional-row"
    :data-regional-guidance-id="region.id"
  >
    <template v-slot:preview>
      <img
        v-if="
          region.mask.asset && region.maskImageUrl && region.maskImageUrl !== failedMaskPreviewUrl
        "
        alt="Regional mask thumbnail"
        class="regional-mask-preview"
        :src="region.maskImageUrl"
        @error="failedMaskPreviewUrl = region.maskImageUrl ?? null"
      />
      <span
        v-else
        :aria-label="
          region.mask.asset ? 'Regional mask preview unavailable' : 'Empty regional mask'
        "
        class="empty-mask-preview"
      >
        —
      </span>
    </template>
    <template v-slot:details>
      <div class="regional-details">
        <p class="regional-status" role="status">
          {{
            region.enabled
              ? 'Generation unavailable while this region is enabled.'
              : 'Disabled regions do not affect generation.'
          }}
        </p>
        <template
          v-for="polarity of promptPolarities"
          :key="`${documentId}:${region.id}:${polarity}`"
        >
          <section
            v-if="region.prompts?.[polarity]"
            :aria-label="
              polarity === 'positive' ? 'Regional prompt block' : 'Regional negative prompt block'
            "
            class="regional-prompt-block"
            data-entity-control
          >
            <header class="regional-prompt-heading">
              <span>{{ polarity === 'positive' ? 'Prompt' : 'Negative Prompt' }}</span>
              <IconButton
                compact
                :disabled="promptEditingDisabled"
                :icon="X"
                :label="
                  polarity === 'positive'
                    ? 'Remove regional prompt'
                    : 'Remove regional negative prompt'
                "
                @click="changePromptBlock(polarity, false)"
              />
            </header>
            <div v-if="polarity === 'negative'" class="regional-negative-source">
              <NSwitch
                :aria-disabled="promptEditingDisabled"
                :aria-labelledby="negativeSourceId"
                :disabled="promptEditingDisabled"
                size="small"
                :value="useGlobalNegative"
                @update:value="changeNegativeSource"
              />
              <span :id="negativeSourceId">Use global negative prompt</span>
            </div>
            <PlainPromptEditor
              v-if="polarity === 'positive' || !useGlobalNegative"
              :ref="(instance) => setPromptEditor(polarity, instance)"
              :ariaLabel="polarity === 'positive' ? 'Regional prompt' : 'Regional negative prompt'"
              compact
              :disabled="Boolean(promptEditingDisabled)"
              :embeddingCatalogReady
              :embeddingRefs="region.prompts[polarity]!.embeddingRefs"
              :embeddingSources
              :embeddingTokens="
                region.prompts[polarity]!.embeddingRefs.map((reference) => reference.token)
              "
              :loraSources
              :modelFamily="currentCanvasFamily"
              :modelValue="region.prompts[polarity]!.text"
              :polarity
              @blur="endPromptEdit(polarity)"
              @focus="beginPromptEdit(polarity)"
              @selectEmbedding="(selection, text) => updatePrompt(polarity, text, selection)"
              @update:modelValue="updatePrompt(polarity, $event)"
            />
          </section>
        </template>
        <section
          v-if="useGlobalNegative"
          :aria-labelledby="inheritedNegativeId"
          class="regional-inherited-negative"
          data-entity-control
        >
          <span :id="inheritedNegativeId">Current Canvas negative prompt</span>
          <p>
            {{
              currentCanvasDraft
                ? currentCanvasDraft.negativePrompt.text || 'Empty'
                : 'Current Canvas settings unavailable.'
            }}
          </p>
        </section>
        <ProjectRegionalReferenceImages
          v-if="region.referenceImages?.length"
          :disabled="referenceEditingDisabled"
          :images="region.referenceImages"
          :ownerKey="`${documentId}:${region.id}`"
          @change="updateReferenceImage"
        />
        <div class="regional-add-actions" data-entity-control>
          <NButton
            v-if="!region.prompts?.positive"
            data-regional-add-polarity="positive"
            :disabled="promptEditingDisabled"
            size="tiny"
            text
            @click="changePromptBlock('positive', true)"
          >
            <template v-slot:icon><NIcon :component="Plus" /></template>
            Prompt
          </NButton>
          <NButton
            v-if="!region.prompts?.negative"
            key="n-button-2"
            data-regional-add-polarity="negative"
            :disabled="promptEditingDisabled"
            size="tiny"
            text
            @click="changePromptBlock('negative', true)"
          >
            <template v-slot:icon><NIcon :component="Plus" /></template>
            Negative Prompt
          </NButton>
          <NButton
            :aria-describedby="referenceDescription ? referenceDescriptionId : undefined"
            aria-label="Add regional reference image"
            data-regional-reference-import
            :disabled="referenceImportDisabled"
            size="tiny"
            text
            @click="importReferenceImage"
          >
            <template v-slot:icon><NIcon :component="Plus" /></template>
            Reference Image
          </NButton>
        </div>
        <p v-if="referenceDescription" :id="referenceDescriptionId" class="regional-help">
          {{ referenceDescription }}
        </p>
      </div>
    </template>
  </ProjectEntitySurface>
  <NModal
    v-model:show="renameOpen"
    aria-label="Rename region"
    negativeText="Cancel"
    :positiveButtonProps="{ disabled: Boolean(renameError) }"
    positiveText="Rename"
    preset="dialog"
    title="Rename region"
    @afterLeave="restoreRenameFocus"
    @negativeClick="cancelRename"
    @positiveClick="commitRename"
  >
    <NFormItem
      :feedback="renameError ?? undefined"
      label="Name"
      :labelFor="renameInputId"
      :validationStatus="renameError ? 'error' : undefined"
    >
      <NInput
        v-model:value="renameValue"
        :inputProps="{ 'aria-label': 'Regional Guidance name', id: renameInputId }"
        @keydown.enter.prevent="renameOnEnter"
        @keydown.esc="cancelRename"
      />
    </NFormItem>
  </NModal>
</template>

<style scoped>
.regional-mask-preview {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty-mask-preview {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--app-text-muted);
}

.regional-details {
  display: grid;
  gap: 6px;
}

.regional-add-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.regional-prompt-block,
.regional-inherited-negative {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.regional-prompt-heading,
.regional-negative-source {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.regional-prompt-heading {
  justify-content: space-between;
}

.regional-inherited-negative {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.regional-inherited-negative p {
  max-height: 96px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.regional-status,
.regional-help {
  margin: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  overflow-wrap: anywhere;
}
</style>
