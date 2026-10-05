<script setup lang="ts">
import type {
  AcceptedResultHistoryCursor,
  AcceptedResultHistoryEntry,
  AcceptedResultHistoryPage,
  AcceptedResultHistoryReference,
} from '../../shared/projects/accepted-result-history.js'

import { Photo as ImageIcon, Refresh as RefreshIcon } from '@vicons/tabler'
import { NAlert, NButton, NCard, NEmpty, NIcon, NModal, NSpin, NTooltip } from 'naive-ui'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{
  busy: boolean
  navigationError: string | null
  readPage: (
    cursor: AcceptedResultHistoryCursor | null,
    refresh: boolean,
  ) => Promise<AcceptedResultHistoryPage>
}>()
const emit = defineEmits<{ closed: []; openResult: [reference: AcceptedResultHistoryReference] }>()
const page = ref<AcceptedResultHistoryPage | null>(null)
const loading = ref(false)
const readError = ref<string | null>(null)
const cursors = ref<(AcceptedResultHistoryCursor | null)[]>([null])
const failedImages = ref(new Set<string>())
const scroller = ref<HTMLElement | null>(null)
let requestId = 0
let disposed = false
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

async function read(cursor: AcceptedResultHistoryCursor | null, refresh = false, direction = 0) {
  const request = ++requestId
  loading.value = true
  readError.value = null
  try {
    const result = await props.readPage(cursor ? { ...cursor } : null, refresh)
    if (disposed || !show.value || request !== requestId) {
      return
    }
    page.value = result
    failedImages.value = new Set()
    if (refresh) {
      cursors.value = [null]
    } else if (direction === 1) {
      cursors.value = [...cursors.value, cursor]
    } else if (direction === -1) {
      cursors.value = cursors.value.slice(0, -1)
    }
    await nextTick()
    if (request === requestId && show.value) {
      scroller.value?.scrollTo({ top: 0 })
    }
  } catch (cause) {
    if (!disposed && show.value && request === requestId) {
      readError.value =
        cause instanceof Error ? cause.message : 'Saved generations could not be read.'
    }
  } finally {
    if (request === requestId) {
      loading.value = false
    }
  }
}

watch(
  show,
  (open) => {
    if (open) {
      void read(null, true)
    } else {
      requestId += 1
      loading.value = false
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  requestId += 1
})
function openResult(entry: AcceptedResultHistoryEntry) {
  if (props.busy || loading.value) {
    return
  }
  emit('openResult', {
    assetSha256: entry.assetSha256,
    documentId: entry.documentId,
    documentRevision: entry.documentRevision,
    layerId: entry.layerId,
    projectKey: entry.projectKey,
  })
}
function imageFailed(url: string) {
  failedImages.value = new Set([...failedImages.value, url])
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false" @afterLeave="emit('closed')">
    <NCard
      aria-label="Saved generations"
      class="history-modal"
      contentClass="history-card-body"
      role="dialog"
      size="small"
      title="Saved generations"
    >
      <template v-slot:header-extra>
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              aria-label="Refresh saved generations"
              :disabled="busy || loading"
              quaternary
              size="small"
              @click="read(null, true)"
            >
              <template v-slot:icon><NIcon :component="RefreshIcon" :size="16" /></template>
            </NButton>
          </template>
          Refresh saved projects and results
        </NTooltip>
      </template>
      <div class="history-content">
        <p class="history-description">
          Generated images saved in your projects. Select an image to open its layer.
        </p>
        <NAlert v-if="navigationError" :showIcon="false" type="warning">
          {{ navigationError }}
        </NAlert>
        <NAlert v-if="readError" key="n-alert-2" :showIcon="false" type="error">
          {{ readError }}
        </NAlert>
        <div ref="scroller" class="history-scroll">
          <NSpin v-if="loading && !page" class="history-loading" size="small" />
          <NEmpty
            v-else-if="page?.totalCount === 0"
            key="n-empty-1"
            class="history-empty"
            description="No saved generations yet"
            size="small"
          >
            <template v-slot:extra>
              Accept a generation as a layer and save its project to include it here.
            </template>
          </NEmpty>
          <NEmpty
            v-else-if="page && page.items.length === 0"
            key="n-empty-2"
            class="history-empty"
            description="No more results on this page"
            size="small"
          />
          <div
            v-else
            :aria-busy="loading"
            aria-label="Saved generations"
            class="history-list"
            role="list"
          >
            <article
              v-for="result of page?.items ?? []"
              :key="`${result.projectKey}:${result.layerId}`"
              :data-layer-id="result.layerId"
              :data-project-key="result.projectKey"
              role="listitem"
            >
              <NButton
                :aria-label="`Open result ${result.layerName} in ${result.projectName}`"
                block
                class="result-button"
                :disabled="busy || loading"
                quaternary
                @click="openResult(result)"
              >
                <span class="result-layout">
                  <span aria-hidden="true" class="result-image">
                    <img
                      v-if="result.imageUrl && !failedImages.has(result.imageUrl)"
                      alt=""
                      decoding="async"
                      loading="lazy"
                      :src="result.imageUrl"
                      @error="imageFailed(result.imageUrl)"
                    />
                    <span v-else class="preview-fallback">
                      <NIcon :component="ImageIcon" :size="22" />
                      <span>Preview unavailable</span>
                    </span>
                  </span>
                  <span class="result-details">
                    <strong class="result-name" :title="result.layerName">
                      {{ result.layerName }}
                    </strong>
                    <span class="result-project" :title="result.projectName">
                      {{ result.projectName }}
                    </span>
                    <span
                      class="result-model"
                      :title="`${result.modelName} · ${result.modelVersionName}`"
                    >
                      {{ result.modelName }} · {{ result.modelVersionName }}
                    </span>
                    <span class="result-metadata">
                      <span>Seed {{ result.seed }}</span>
                      <span>{{ result.width }} × {{ result.height }}</span>
                      <time :datetime="result.acceptedAt">
                        {{ dateFormat.format(new Date(result.acceptedAt)) }}
                      </time>
                    </span>
                  </span>
                </span>
              </NButton>
            </article>
          </div>
        </div>
      </div>
      <template v-slot:footer>
        <div class="history-footer">
          <span class="history-count">
            {{
              page
                ? `${page.items.length} shown · ${page.totalCount} saved`
                : readError
                  ? 'Results unavailable'
                  : 'Loading saved results…'
            }}
          </span>
          <div class="history-pagination">
            <NButton
              :disabled="busy || loading || cursors.length < 2"
              size="small"
              @click="read(cursors[cursors.length - 2] ?? null, false, -1)"
            >
              Newer results
            </NButton>
            <NButton
              :disabled="busy || loading || !page?.nextCursor"
              size="small"
              @click="page?.nextCursor && read(page.nextCursor, false, 1)"
            >
              Older results
            </NButton>
          </div>
          <NButton size="small" @click="show = false">Close</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.history-modal {
  width: min(760px, calc(100vw - 40px));
  height: min(720px, calc(100vh - 64px));
}
.history-modal :deep(.history-card-body) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.history-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
}
.history-description {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.history-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.history-list {
  display: grid;
  gap: 6px;
}
.history-loading,
.history-empty {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
}
.result-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: auto;
  justify-content: flex-start;
  padding: 10px;
  text-align: left;
}
.result-layout {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  width: 100%;
}
.result-image {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  overflow: hidden;
  background: var(--app-elevated);
  border-radius: 3px;
}
.result-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
  white-space: normal;
  text-align: center;
}
.result-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.result-name,
.result-project,
.result-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-name {
  font-size: 13px;
}
.result-project {
  font-size: 12px;
}
.result-model {
  font-size: 12px;
  color: var(--app-text-muted);
}
.result-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 11px;
  color: var(--app-text-muted);
  white-space: normal;
}
.history-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}
.history-count {
  margin-right: auto;
  color: var(--app-text-muted);
  font-size: 11px;
}
.history-pagination {
  display: flex;
  gap: 6px;
}
@media (max-width: 600px) {
  .history-footer {
    flex-wrap: wrap;
  }
  .history-count {
    flex: 1 0 100%;
  }
  .history-pagination {
    margin-right: auto;
  }
}
</style>
