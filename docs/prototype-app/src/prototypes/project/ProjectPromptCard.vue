<script setup lang="ts">
import { NCard, NInput, NText, useMessage } from 'naive-ui';
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
const warning = computed(() => value.value.includes('(broken'));

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
  <div ref="root">
    <NCard size="small">
      <template v-slot:header
        ><div class="prompt-header">
          <strong>{{ title }}</strong
          ><ProjectPromptActions
            @clear="clear"
            @copy="copy"
            @decrease="attention(-1)"
            @dynamicPreview="emit('dynamicPreview')"
            @increase="attention(1)"
            @insertTag="insertTag"
          /></div
      ></template>
      <NInput
        :aria-label="title"
        :autosize="{ minRows: field === 'prompt' ? 3 : 2, maxRows: 6 }"
        :inputProps="{ 'aria-label': title }"
        size="small"
        type="textarea"
        :value
        @blur="finishEdit"
        @focus="beginEdit"
        @keydown="hotkey"
        @select="rememberSelection"
        @update:value="update"
      />
      <div class="prompt-footer">
        <NText depth="3">{{ value.split(/\s+/).filter(Boolean).length }} tokens</NText
        ><NText v-if="warning" type="warning">Check prompt weights</NText>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.prompt-header,
.prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.prompt-header {
  width: 100%;
}
.prompt-footer {
  margin-top: 4px;
  font-size: 11px;
}
</style>
