import type { PresetApplicationDiagnostic } from '../../shared/presets/preset-application.js'

import { type ModelManagerFocus, modelManagerFocusFor } from './model-manager-focus.js'

/** Browse the diagnosed edited reference; never select or rewrite a Project resource. */
export function presetDiagnosticModelFocus(
  diagnostic: PresetApplicationDiagnostic,
): ModelManagerFocus | null {
  return diagnostic.resource
    ? {
        ...modelManagerFocusFor(diagnostic.resource.kind, diagnostic.resource),
        expectedResource: JSON.parse(JSON.stringify(diagnostic.resource)) as NonNullable<
          PresetApplicationDiagnostic['resource']
        >,
        origin: 'preset',
      }
    : null
}

/** Keep every explanation, with one browse action per exact reference in each section. */
export function presetDiagnosticModelRows(diagnostics: readonly PresetApplicationDiagnostic[]) {
  const seen = new Set<string>()
  return diagnostics.map((diagnostic) => {
    const resource = diagnostic.resource
    const key = resource
      ? JSON.stringify([
          diagnostic.section,
          resource.kind,
          resource.localModelId,
          resource.localVersionId,
          resource.fileSha256,
          resource.civitaiModelId,
          resource.civitaiVersionId,
          resource.civitaiFileId,
          resource.baseModelFamily,
        ])
      : null
    const focus = key && !seen.has(key) ? presetDiagnosticModelFocus(diagnostic) : null
    if (key) {
      seen.add(key)
    }
    return { actionKey: focus ? key : null, diagnostic, focus }
  })
}
