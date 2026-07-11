<script setup lang="ts">
import { AlertTriangle } from '@vicons/tabler';
import { NIcon, NInput, NText, NTooltip, useMessage } from 'naive-ui';
import { computed, nextTick, ref } from 'vue';

import type { ProjectDocumentModel, ProjectSession } from './project.types';

import {
  cloneDocument,
  commitProjectEditFromBaseline,
  commitProjectMutation,
} from './project-history';
import { adjustPromptAttention } from './project-prompt.utils';
import { getActiveGenerationDraft } from './project.utils';
import ProjectPromptActions from './ProjectPromptActions.vue';

const props = defineProps<{
  field: 'negativePrompt' | 'prompt';
  session: ProjectSession;
  title: string;
}>();
const emit = defineEmits<{ dynamicPreview: [] }>();
const message = useMessage();
const root = ref<HTMLElement | null>(null);
const lastSelection = ref({ end: 0, start: 0 });
let baseline: ProjectDocumentModel | undefined;
const value = computed(() => getActiveGenerationDraft(props.session).payload[props.field] ?? '');
const tokenCount = computed(() => value.value.split(/\s+/).filter(Boolean).length);
const warning = computed(() => value.value.includes('(broken'));
const promptInputTheme = {
  color: 'transparent',
  colorFocus: 'transparent',
  paddingSmall: '0',
} as const;

function beginEdit() {
  baseline ??= cloneDocument(props.session.document);
}
function update(next: string) {
  beginEdit();
  getActiveGenerationDraft(props.session).payload[props.field] = next;
}
function finishEdit() {
  if (!baseline) {
    return;
  }
  commitProjectEditFromBaseline(props.session, `Edit ${props.title.toLowerCase()}`, baseline);
  baseline = undefined;
}
function textarea() {
  return root.value?.querySelector('textarea') ?? undefined;
}
function rememberSelection(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  lastSelection.value = { end: input.selectionEnd, start: input.selectionStart };
}
function attention(direction: -1 | 1) {
  finishEdit();
  const input = textarea();
  if (!input) {
    return;
  }
  const selection =
    input.selectionStart === input.selectionEnd &&
    lastSelection.value.start !== lastSelection.value.end
      ? lastSelection.value
      : { end: input.selectionEnd, start: input.selectionStart };
  const result = adjustPromptAttention(value.value, selection.start, selection.end, direction);
  if (result.value === value.value) {
    return;
  }
  commitProjectMutation(
    props.session,
    `${direction > 0 ? 'Increase' : 'Decrease'} prompt attention`,
    () => {
      getActiveGenerationDraft(props.session).payload[props.field] = result.value;
    },
  );
  void nextTick(() => {
    input.focus();
    input.setSelectionRange(result.selectionStart, result.selectionEnd);
  });
}
function insertTag(tag: string) {
  finishEdit();
  const input = textarea();
  const start = input?.selectionStart ?? value.value.length;
  const spacer = start > 0 && !/[\s,]$/.test(value.value.slice(0, start)) ? ', ' : '';
  const next = `${value.value.slice(0, start)}${spacer}${tag}${value.value.slice(start)}`;
  commitProjectMutation(props.session, 'Insert prompt tag', () => {
    getActiveGenerationDraft(props.session).payload[props.field] = next;
  });
}
async function copy() {
  await navigator.clipboard.writeText(value.value);
  message.success(`${props.title} copied`);
}
function clear() {
  finishEdit();
  commitProjectMutation(props.session, `Clear ${props.title.toLowerCase()}`, () => {
    getActiveGenerationDraft(props.session).payload[props.field] = '';
  });
}
function hotkey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
    return;
  }
  event.preventDefault();
  attention(event.key === 'ArrowUp' ? 1 : -1);
}
</script>

<template>
  <section ref="root" class="prompt-card">
    <header class="prompt-meta">
      <strong>{{ title }}</strong>
      <NText depth="3">{{ tokenCount }} tokens</NText>
      <NTooltip v-if="warning">
        <template v-slot:trigger>
          <NIcon
            aria-label="Check prompt weights"
            class="prompt-warning"
            :component="AlertTriangle"
          />
        </template>
        Check prompt weights
      </NTooltip>
    </header>
    <NInput
      :aria-label="title"
      :bordered="false"
      class="prompt-input"
      :inputProps="{ 'aria-label': title }"
      :resizable="false"
      :rows="6"
      size="small"
      :themeOverrides="promptInputTheme"
      type="textarea"
      :value
      @blur="finishEdit"
      @focus="beginEdit"
      @keydown="hotkey"
      @select="rememberSelection"
      @update:value="update"
    />
    <ProjectPromptActions
      class="prompt-actions-rail"
      @clear="clear"
      @copy="copy"
      @decrease="attention(-1)"
      @dynamicPreview="emit('dynamicPreview')"
      @increase="attention(1)"
      @insertTag="insertTag"
    />
  </section>
</template>

<style scoped>
.prompt-card {
  padding: 7px 5px 7px 9px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
  position: relative;
  resize: vertical;
  overflow: hidden;
  min-height: 150px;
}
.prompt-card:focus-within {
  border-color: var(--workspace-green);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--workspace-green) 18%, transparent);
}
.prompt-meta {
  grid-area: meta;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  line-height: 1.2;
  position: absolute;
  top: 5px;
  left: 7px;
}
.prompt-meta strong {
  font-weight: 600;
}
.prompt-meta .n-text {
  font-size: var(--app-font-size-meta);
}
.prompt-warning {
  flex: 0 0 auto;
  color: var(--status-warning);
}
.prompt-input {
  grid-area: input;
  min-width: 0;
  padding-top: 12px;
  padding-right: 18px;
}
.prompt-actions-rail {
  grid-area: actions;
  align-self: start;
  position: absolute;
  top: 7px;
  right: 5px;
}
</style>
