<script setup lang="ts">
import { AlertTriangle, DotsVertical, Eye, EyeOff, Lock, LockOpen, Plus, X } from '@vicons/tabler'
import { NButton, NDropdown, NIcon, NInput, NSwitch, NTooltip } from 'naive-ui'
import { ref } from 'vue'

import type { ProjectSession, RegionalGuidanceLayerModel } from './project.types'

import { clonePreset } from '../presets/presets.utils'
import {
  beginProjectEdit,
  commitActiveProjectEdit,
  commitProjectMutation,
  updateProjectEdit,
} from './project-history'
import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectEntitySurface from './ProjectEntitySurface.vue'

const props = defineProps<{
  entity: RegionalGuidanceLayerModel
  selected: boolean
  session: ProjectSession
}>()
const positiveOpen = ref(Boolean(props.entity.positivePrompt))
const negativeOpen = ref(!props.entity.autoNegative || Boolean(props.entity.negativePrompt))
const imageInput = ref<HTMLInputElement>()
function mutate(label: string, update: () => void) {
  commitProjectMutation(props.session, label, update)
}
function select() {
  props.session.ui.selection = { id: props.entity.id, kind: 'regional-guidance' }
}
function edit(field: 'negativePrompt' | 'positivePrompt', value: string) {
  beginProjectEdit(props.session, `regional:${props.entity.id}:${field}`, 'Edit regional prompt')
  updateProjectEdit(props.session, () => {
    props.entity[field] = value
  })
}
function duplicate() {
  mutate('Duplicate Regional Guidance', () => {
    const copy = clonePreset(props.entity)
    copy.id = crypto.randomUUID()
    copy.name += ' copy'
    props.session.document.regionalGuidance.push(copy)
    props.session.ui.selection = { id: copy.id, kind: 'regional-guidance' }
  })
}
function remove() {
  mutate('Delete Regional Guidance', () => {
    props.session.document.regionalGuidance = props.session.document.regionalGuidance.filter(
      (r) => r.id !== props.entity.id,
    )
    if (props.selected) {
      props.session.ui.selection = undefined
    }
  })
}
function addNegative() {
  negativeOpen.value = true
  mutate('Add regional negative prompt', () => {
    props.entity.autoNegative = false
  })
}
async function addReferences(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])].filter((file) => file.type.startsWith('image/'))
  try {
    const images = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ id: string; name: string; previewUrl: string; tone: 'blue' }>(
            (resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  previewUrl: String(reader.result),
                  tone: 'blue',
                })
              reader.onerror = () => reject(reader.error)
              reader.readAsDataURL(file)
            },
          ),
      ),
    )
    if (!props.session.document.regionalGuidance.some((r) => r.id === props.entity.id)) {
      return
    }
    if (images.length) {
      mutate('Add regional reference images', () => {
        props.entity.referenceImages.push(...images)
      })
    }
  } catch {
    props.session.ui.notice = {
      text: 'Could not read the reference image. Try another file.',
      type: 'error',
    }
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <ProjectEntitySurface class="regional-row" :selected>
    <NButton
      :aria-label="`${entity.enabled ? 'Hide' : 'Show'} ${entity.name}`"
      circle
      quaternary
      size="tiny"
      @click="mutate('Toggle Regional Guidance', () => (entity.enabled = !entity.enabled))"
    >
      <NIcon :component="entity.enabled ? Eye : EyeOff" />
    </NButton>
    <NButton :aria-label="`Select ${entity.name}`" class="regional-select" text @click="select">
      <span class="region-thumb" />
      <span class="regional-name">
        <strong v-overflow-title>{{ entity.name }}</strong>
        <small>
          {{ entity.positivePrompt ? 'Prompt · ' : ''
          }}{{ entity.referenceImages.length }} reference{{
            entity.referenceImages.length === 1 ? '' : 's'
          }}
        </small>
      </span>
    </NButton>
    <NTooltip v-if="entity.compatibilityStatus !== 'ok'">
      <template v-slot:trigger>
        <NIcon
          aria-label="Regional Guidance compatibility warning"
          class="compatibility-warning"
          :component="AlertTriangle"
        />
      </template>
      The current model may ignore regional reference images.
    </NTooltip>
    <NButton
      :aria-label="`${entity.locked ? 'Unlock' : 'Lock'} ${entity.name}`"
      circle
      quaternary
      size="tiny"
      @click="mutate('Toggle region lock', () => (entity.locked = !entity.locked))"
    >
      <NIcon :component="entity.locked ? Lock : LockOpen" />
    </NButton>
    <NDropdown
      :options="[
        { key: 'duplicate', label: 'Duplicate region' },
        { key: 'delete', label: 'Delete region' },
      ]"
      trigger="click"
      @select="$event === 'duplicate' ? duplicate() : remove()"
    >
      <NButton :aria-label="`Layer actions for ${entity.name}`" circle quaternary size="tiny">
        <NIcon :component="DotsVertical" />
      </NButton>
    </NDropdown>
    <template v-if="selected" v-slot:details>
      <div class="regional-settings">
        <div v-if="positiveOpen || entity.positivePrompt" class="regional-field">
          <header>
            <span>Prompt</span>
            <NButton
              aria-label="Remove regional prompt"
              circle
              quaternary
              size="tiny"
              @click="
                () => {
                  mutate('Remove regional prompt', () => (entity.positivePrompt = ''))
                  positiveOpen = false
                }
              "
            >
              <NIcon :component="X" />
            </NButton>
          </header>
          <NInput
            :inputProps="{ 'aria-label': 'Regional prompt' }"
            :rows="2"
            type="textarea"
            :value="entity.positivePrompt"
            @blur="commitActiveProjectEdit(session)"
            @update:value="edit('positivePrompt', $event)"
          />
        </div>
        <div v-if="negativeOpen || !entity.autoNegative" class="regional-field">
          <header>
            <span>Negative Prompt</span>
            <NButton
              aria-label="Remove regional negative prompt"
              circle
              quaternary
              size="tiny"
              @click="
                () => {
                  mutate('Remove regional negative prompt', () => {
                    entity.negativePrompt = ''
                    entity.autoNegative = true
                  })
                  negativeOpen = false
                }
              "
            >
              <NIcon :component="X" />
            </NButton>
          </header>
          <label class="negative-source">
            <NSwitch
              aria-label="Use global negative prompt"
              size="small"
              :value="entity.autoNegative"
              @update:value="
                mutate('Change regional negative source', () => (entity.autoNegative = $event))
              "
            />
            Use global negative prompt
          </label>
          <NInput
            v-if="!entity.autoNegative"
            :inputProps="{ 'aria-label': 'Regional negative prompt' }"
            :rows="2"
            type="textarea"
            :value="entity.negativePrompt"
            @blur="commitActiveProjectEdit(session)"
            @update:value="edit('negativePrompt', $event)"
          />
        </div>
        <div v-if="entity.referenceImages.length" class="reference-strip">
          <div
            v-for="reference of entity.referenceImages"
            :key="reference.id"
            class="reference"
            :title="reference.name"
          >
            <img v-if="reference.previewUrl" :alt="reference.name" :src="reference.previewUrl" />
            <ProjectCanvasArtwork v-else :tone="reference.tone" />
            <NButton
              :aria-label="`Remove reference ${reference.name}`"
              circle
              class="reference-remove"
              secondary
              size="tiny"
              @click="
                mutate(
                  'Remove regional reference',
                  () =>
                    (entity.referenceImages = entity.referenceImages.filter(
                      (r) => r.id !== reference.id,
                    )),
                )
              "
            >
              <NIcon :component="X" />
            </NButton>
          </div>
        </div>
        <div class="regional-add-actions">
          <NButton
            v-if="!positiveOpen && !entity.positivePrompt"
            size="tiny"
            text
            @click="positiveOpen = true"
          >
            <NIcon :component="Plus" />
            Prompt
          </NButton>
          <NButton
            v-if="!negativeOpen && entity.autoNegative"
            key="n-button-2"
            size="tiny"
            text
            @click="addNegative"
          >
            <NIcon :component="Plus" />
            Negative Prompt
          </NButton>
          <NButton size="tiny" text @click="imageInput?.click()">
            <NIcon :component="Plus" />
            Reference Image
          </NButton>
        </div>
        <input
          ref="imageInput"
          accept="image/*"
          aria-label="Add regional reference images"
          class="file-input"
          multiple
          type="file"
          @change="addReferences"
        />
      </div>
    </template>
  </ProjectEntitySurface>
</template>

<style scoped>
.regional-select {
  flex: 1;
  min-width: 0;
  height: 48px;
  justify-content: start;
  padding: 4px 6px;
}
.regional-select :deep(.n-button__content) {
  display: flex;
  gap: 7px;
  width: 100%;
  min-width: 0;
  justify-content: start;
}
.regional-name {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.regional-name strong,
.regional-name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.regional-name small,
.regional-field header,
.negative-source {
  color: var(--app-text-muted);
}
.region-thumb {
  flex: 0 0 32px;
  height: 32px;
  border: 1px solid var(--app-border);
  border-radius: 2px;
  background:
    radial-gradient(
      ellipse at 52% 48%,
      var(--prompt-context-border) 0 24%,
      var(--prompt-context-surface) 28% 46%,
      transparent 50%
    ),
    var(--canvas-background);
}
.compatibility-warning {
  color: var(--status-warning);
}
.regional-settings {
  display: grid;
  gap: 8px;
}
.regional-field {
  display: grid;
  gap: 4px;
}
.regional-field header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.negative-source {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.regional-add-actions,
.reference-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.regional-add-actions .n-icon {
  margin-right: 3px;
}
.reference {
  position: relative;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.reference img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.reference-remove {
  position: absolute;
  top: 2px;
  right: 2px;
}
.file-input {
  display: none;
}
</style>
