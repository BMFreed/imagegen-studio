import type { ProjectDocumentModel, ProjectSession } from './project.types'

export function cloneDocument(document: ProjectDocumentModel): ProjectDocumentModel {
  // Project documents are JSON-shaped prototype state. Serializing here unwraps
  // nested Vue proxies as well as the top-level proxy, which structuredClone
  // cannot do reliably after an editor updates reactive prompt metadata.
  return JSON.parse(JSON.stringify(document)) as ProjectDocumentModel
}

export function commitProjectMutation(
  session: ProjectSession,
  label: string,
  mutate: (document: ProjectDocumentModel) => void,
) {
  commitActiveProjectEdit(session)
  session.history.past.push({ document: cloneDocument(session.document), label })
  if (session.history.past.length > 64) {
    session.history.past.shift()
  }
  session.history.future = []
  mutate(session.document)
  refreshPatchStatus(session.document)
  session.document.updatedAt = new Date().toISOString()
  session.dirty = true
}

export function beginProjectEdit(session: ProjectSession, key: string, label: string) {
  if (session.history.activeEdit?.key === key) {
    return
  }
  commitActiveProjectEdit(session)
  session.history.activeEdit = { baseline: cloneDocument(session.document), key, label }
}

export function updateProjectEdit(
  session: ProjectSession,
  mutate: (document: ProjectDocumentModel) => void,
) {
  mutate(session.document)
  refreshPatchStatus(session.document)
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument)
}

export function commitActiveProjectEdit(session: ProjectSession) {
  const transaction = session.history.activeEdit
  if (!transaction) {
    return false
  }
  session.history.activeEdit = undefined
  if (JSON.stringify(transaction.baseline) === JSON.stringify(session.document)) {
    return false
  }
  session.history.past.push({ document: transaction.baseline, label: transaction.label })
  if (session.history.past.length > 64) {
    session.history.past.shift()
  }
  session.history.future = []
  session.document.updatedAt = new Date().toISOString()
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument)
  return true
}

export function cancelActiveProjectEdit(session: ProjectSession) {
  const transaction = session.history.activeEdit
  if (!transaction) {
    return
  }
  session.document = cloneDocument(transaction.baseline)
  session.history.activeEdit = undefined
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument)
}

export function commitProjectEditFromBaseline(
  session: ProjectSession,
  label: string,
  baseline: ProjectDocumentModel,
) {
  if (JSON.stringify(baseline) === JSON.stringify(session.document)) {
    return
  }
  session.history.past.push({ document: cloneDocument(baseline), label })
  if (session.history.past.length > 64) {
    session.history.past.shift()
  }
  session.history.future = []
  session.document.updatedAt = new Date().toISOString()
  session.dirty = true
}

export function undoProject(session: ProjectSession) {
  commitActiveProjectEdit(session)
  const entry = session.history.past.pop()
  if (!entry) {
    return
  }
  session.history.future.push({ document: cloneDocument(session.document), label: entry.label })
  session.document = cloneDocument(entry.document)
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument)
}

export function redoProject(session: ProjectSession) {
  commitActiveProjectEdit(session)
  const entry = session.history.future.pop()
  if (!entry) {
    return
  }
  session.history.past.push({ document: cloneDocument(session.document), label: entry.label })
  session.document = cloneDocument(entry.document)
  session.dirty = JSON.stringify(session.document) !== JSON.stringify(session.savedDocument)
}

export function saveProjectSession(session: ProjectSession) {
  commitActiveProjectEdit(session)
  if (session.saveShouldFail) {
    return false
  }
  session.savedDocument = cloneDocument(session.document)
  session.dirty = false
  return true
}

export function discardProjectChanges(session: ProjectSession) {
  cancelActiveProjectEdit(session)
  session.document = cloneDocument(session.savedDocument)
  session.history = { future: [], past: [] }
  session.staging = undefined
  session.dirty = false
}

function refreshPatchStatus(document: ProjectDocumentModel) {
  for (const layer of document.layers) {
    if (layer.kind !== 'smart-patch') {
      continue
    }
    const source = layer.variants.find((v) => v.id === layer.activeVariantId)?.provenance?.source
    if (!source) {
      continue
    }
    const current = {
      bbox: layer.bbox,
      draft: layer.generationDraft,
      internalHeight: layer.internalHeight,
      internalWidth: layer.internalWidth,
      maskRevision: layer.maskRevision,
    }
    layer.status = JSON.stringify(source) === JSON.stringify(current) ? 'ready' : 'outdated'
  }
}
