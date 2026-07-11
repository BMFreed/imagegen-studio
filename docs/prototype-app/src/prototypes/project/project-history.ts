import { toRaw } from 'vue';

import type { ProjectDocumentModel, ProjectSession } from './project.types';

export function cloneDocument(document: ProjectDocumentModel): ProjectDocumentModel {
  return structuredClone(toRaw(document));
}

export function commitProjectMutation(
  session: ProjectSession,
  label: string,
  mutate: (document: ProjectDocumentModel) => void,
) {
  session.history.past.push({ document: cloneDocument(session.document), label });
  if (session.history.past.length > 64) {
    session.history.past.shift();
  }
  session.history.future = [];
  mutate(session.document);
  session.document.updatedAt = new Date().toISOString();
  session.dirty = true;
}

export function commitProjectEditFromBaseline(
  session: ProjectSession,
  label: string,
  baseline: ProjectDocumentModel,
) {
  if (JSON.stringify(baseline) === JSON.stringify(session.document)) {
    return;
  }
  session.history.past.push({ document: cloneDocument(baseline), label });
  if (session.history.past.length > 64) {
    session.history.past.shift();
  }
  session.history.future = [];
  session.document.updatedAt = new Date().toISOString();
  session.dirty = true;
}

export function undoProject(session: ProjectSession) {
  const entry = session.history.past.pop();
  if (!entry) {
    return;
  }
  session.history.future.push({ document: cloneDocument(session.document), label: entry.label });
  session.document = cloneDocument(entry.document);
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument);
}

export function redoProject(session: ProjectSession) {
  const entry = session.history.future.pop();
  if (!entry) {
    return;
  }
  session.history.past.push({ document: cloneDocument(session.document), label: entry.label });
  session.document = cloneDocument(entry.document);
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument);
}

export function saveProjectSession(session: ProjectSession) {
  if (session.saveShouldFail) {
    return false;
  }
  session.savedDocument = cloneDocument(session.document);
  session.dirty = false;
  return true;
}

export function discardProjectChanges(session: ProjectSession) {
  session.document = cloneDocument(session.savedDocument);
  session.history = { future: [], past: [] };
  session.staging = undefined;
  session.queueItems = [];
  session.dirty = false;
}
