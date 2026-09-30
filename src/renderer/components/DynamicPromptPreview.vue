<script setup lang="ts">
import {
  GenerationBatchPlanError,
  planGenerationBatch,
} from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import {
  GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS,
  type GenerationDynamicPromptSettings,
} from '../../shared/projects/generation-dynamic-settings.js'

import { NAlert, NButton, NCard, NInputNumber, NModal, NSelect, NText } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  disabled: boolean
  negativePrompt: string
  positivePrompt: string
}>()
const settings = defineModel<GenerationDynamicPromptSettings>('settings', { required: true })
const show = defineModel<boolean>('show', { default: false })
const behaviorOptions = [
  { label: 'Per iteration', value: 'per-iteration' },
  { label: 'Per prompt', value: 'per-prompt' },
]
const preview = computed(() => {
  try {
    return {
      error: null,
      plan: planGenerationBatch({
        // Expansion preview never selects a Random/Reuse base or advances a completed cursor.
        baseSeed: 0,
        iterations: 1,
        maxJobs: GENERATION_BATCH_JOB_LIMIT,
        maxPrompts: settings.value.maxPrompts,
        negativePrompt: props.negativePrompt,
        positivePrompt: props.positivePrompt,
        seedBehavior: settings.value.seedBehavior,
      }),
    }
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : 'The prompts could not be expanded.',
        tooLarge: error instanceof GenerationBatchPlanError && error.code === 'BATCH_TOO_LARGE',
      },
      plan: null,
    }
  }
})
const literalBraces = computed(() =>
  preview.value.plan?.items.some((item) =>
    /[{}]/.test(item.prompts.positive + item.prompts.negative),
  ),
)

function updateMaximum(value: number | null) {
  if (
    props.disabled ||
    value === null ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS ||
    value === settings.value.maxPrompts
  ) {
    return
  }
  settings.value = { ...settings.value, maxPrompts: value }
}

function updateBehavior(value: string) {
  if (
    props.disabled ||
    (value !== 'per-iteration' && value !== 'per-prompt') ||
    value === settings.value.seedBehavior
  ) {
    return
  }
  settings.value = { ...settings.value, seedBehavior: value }
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Dynamic Prompt Preview"
      class="dynamic-preview"
      :contentStyle="{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0',
        overflow: 'hidden',
      }"
      role="dialog"
      size="small"
      title="Dynamic Prompt Preview"
    >
      <div class="preview-settings">
        <label class="preview-maximum">
          Max prompts
          <NInputNumber
            :disabled
            :inputProps="{ 'aria-label': 'Maximum dynamic prompts' }"
            :max="GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS"
            :min="1"
            :precision="0"
            size="small"
            :value="settings.maxPrompts"
            @update:value="updateMaximum"
          />
        </label>
        <label>
          Seed behavior
          <NSelect
            aria-label="Dynamic prompt seed behavior"
            :disabled
            :options="behaviorOptions"
            size="small"
            :value="settings.seedBehavior"
            @update:value="updateBehavior"
          />
        </label>
      </div>
      <NText class="preview-help" depth="3">
        {{
          settings.seedBehavior === 'per-iteration'
            ? 'One seed per iteration, shared by every expanded prompt pair.'
            : 'A different seed for every prompt pair and iteration.'
        }}
        Settings are saved with this project. This preview uses one iteration.
      </NText>
      <NAlert
        v-if="preview.error"
        class="preview-feedback"
        :title="preview.error.tooLarge ? 'Too many generation jobs' : 'Could not expand prompts'"
        type="error"
      >
        {{
          preview.error.tooLarge
            ? `The job limit is ${GENERATION_BATCH_JOB_LIMIT}. Lower Max prompts or simplify the alternatives.`
            : preview.error.message
        }}
      </NAlert>
      <template v-else-if="preview.plan">
        <NAlert
          v-if="preview.plan.truncated"
          key="n-alert-2"
          class="preview-feedback"
          title="Preview truncated at the configured maximum"
          type="warning"
        >
          Showing the first {{ settings.maxPrompts }} prompt pairs. Later alternatives are omitted.
        </NAlert>
        <NAlert
          v-if="literalBraces"
          key="n-alert-3"
          class="preview-feedback"
          title="Literal braces are not supported for generation yet"
          type="warning"
        >
          The expansion below preserves escaped braces. Remove them before generation.
        </NAlert>
        <div class="preview-summary" role="status">
          <strong>
            {{ preview.plan.items.length }} concrete prompt
            {{ preview.plan.items.length === 1 ? 'pair' : 'pairs' }}
          </strong>
          <NText depth="3">
            {{ preview.plan.items.length }} jobs · 1 iteration · limit
            {{ GENERATION_BATCH_JOB_LIMIT }}
          </NText>
        </div>
        <div aria-label="Expanded prompt pairs" class="preview-pairs" role="region" tabindex="0">
          <article v-for="item of preview.plan.items" :key="item.promptPairIndex">
            <strong class="pair-number">{{ item.promptPairIndex + 1 }}</strong>
            <span class="pair-positive">
              {{ item.prompts.positive || 'Empty positive prompt' }}
            </span>
            <small class="pair-negative">
              {{ item.prompts.negative || 'Empty negative prompt' }}
            </small>
          </article>
        </div>
      </template>
      <template v-slot:footer>
        <div class="preview-footer"><NButton @click="show = false">Close</NButton></div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.dynamic-preview {
  width: min(720px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
}

.preview-settings {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 10px;
}

.preview-settings label {
  display: grid;
  min-width: 0;
  gap: 4px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.preview-help {
  margin-bottom: 12px;
  font-size: var(--app-font-size-meta);
}

.preview-feedback {
  flex: none;
  margin-bottom: 10px;
}

.preview-summary {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 8px;
  font-size: var(--app-font-size-meta);
}

.preview-pairs {
  display: grid;
  flex: 1;
  min-height: 0;
  max-height: 380px;
  align-content: start;
  gap: 6px;
  overflow: auto;
}

.preview-pairs article {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 3px 8px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.pair-number,
.pair-negative {
  color: var(--app-text-muted);
}

.pair-positive,
.pair-negative {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.pair-negative {
  grid-column: 2;
  font-size: var(--app-font-size-meta);
}

.preview-footer {
  display: flex;
  justify-content: end;
}
</style>
