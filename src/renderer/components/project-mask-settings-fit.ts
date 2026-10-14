import type {
  ProjectSmartPatchLayerView,
  ProjectSmartPatchMaskEditRequest,
} from '../../shared/api.js'
import type { ProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'

import type { MaskGestureOwner } from './project-mask-gesture.js'

export interface ProjectMaskSettingsFitState {
  available: boolean
  busy: boolean
  failed: boolean
  geometry: FitGeometry
  owner: MaskGestureOwner | null
  settings: ProjectMaskSettings
}

export type ProjectMaskSettingsFitDecision =
  | { kind: 'cancelled' | 'waiting' }
  | { kind: 'ready'; layerId: string; request: ProjectSmartPatchMaskEditRequest }

type FitGeometry = Pick<ProjectSmartPatchLayerView, 'boundingBox' | 'internalResolution' | 'mask'>

/** Only an explicit Fit click creates this continuation; a setting change alone never does. */
export class ProjectMaskSettingsFit {
  readonly expectedSettings: Readonly<ProjectMaskSettings>
  readonly owner: Readonly<MaskGestureOwner>
  private ended = false
  private readonly geometry: string

  constructor(
    owner: MaskGestureOwner,
    expectedSettings: ProjectMaskSettings,
    geometry: FitGeometry,
  ) {
    this.owner = Object.freeze({ ...owner })
    this.expectedSettings = Object.freeze({ ...expectedSettings })
    this.geometry = fitGeometrySignature(geometry)
  }

  advance(state: ProjectMaskSettingsFitState): ProjectMaskSettingsFitDecision {
    if (this.ended) {
      return { kind: 'cancelled' }
    }
    const owner = state.owner
    if (
      !owner ||
      owner.projectKey !== this.owner.projectKey ||
      owner.documentId !== this.owner.documentId ||
      owner.layerId !== this.owner.layerId ||
      owner.maskId !== this.owner.maskId ||
      owner.maskRevision !== this.owner.maskRevision ||
      !state.available ||
      state.failed ||
      fitGeometrySignature(state.geometry) !== this.geometry
    ) {
      this.ended = true
      return { kind: 'cancelled' }
    }
    if (state.busy) {
      return { kind: 'waiting' }
    }
    this.ended = true
    if (
      owner.documentRevision === this.owner.documentRevision ||
      state.settings.blur !== this.expectedSettings.blur ||
      state.settings.padding !== this.expectedSettings.padding
    ) {
      return { kind: 'cancelled' }
    }
    return {
      kind: 'ready',
      layerId: this.owner.layerId,
      request: {
        documentId: owner.documentId,
        documentRevision: owner.documentRevision,
        edit: { kind: 'fit-bbox' },
        maskId: this.owner.maskId,
        maskRevision: this.owner.maskRevision,
      },
    }
  }

  cancel(): void {
    this.ended = true
  }
}

function fitGeometrySignature(patch: FitGeometry): string {
  const { boundingBox: bbox, internalResolution: internal, mask } = patch
  const bounds = 'bounds' in mask ? mask.bounds : null
  return JSON.stringify([
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    internal.width,
    internal.height,
    mask.id,
    mask.revision,
    mask.asset
      ? [mask.asset.path, mask.asset.sha256, mask.asset.bytes, mask.asset.width, mask.asset.height]
      : null,
    bounds ? [bounds.x, bounds.y, bounds.width, bounds.height] : null,
  ])
}
