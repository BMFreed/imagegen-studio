import type { HomeProjectRecord, HomeScenario, HomeScenarioId, HomeWorkspace } from './home.types'

const workspaces: HomeWorkspace[] = [
  {
    availability: 'available',
    color: '#64e36e',
    id: 'uncategorized',
    isDefault: true,
    name: 'Uncategorized',
    path: 'ImageGen Studio/workspaces/Uncategorized',
  },
  {
    availability: 'available',
    color: '#74a8ff',
    id: 'character-studies',
    isDefault: false,
    name: 'Character studies',
    path: '~/Pictures/ImageGen/Character studies',
  },
  {
    availability: 'available',
    color: '#f0b65f',
    id: 'upscale-tests',
    isDefault: false,
    name: 'Upscale tests',
    path: '~/Pictures/ImageGen/Upscale tests',
  },
  {
    availability: 'available',
    color: '#b58cff',
    id: 'regional-drafts',
    isDefault: false,
    name: 'Regional guidance drafts',
    path: '~/Pictures/ImageGen/Regional guidance drafts',
  },
  {
    availability: 'available',
    color: '#83cbb8',
    id: 'empty-workspace',
    isDefault: false,
    name: 'New workspace',
    path: '~/Pictures/ImageGen/New workspace',
  },
  {
    availability: 'missing',
    color: '#b8a06a',
    id: 'archive-drive',
    isDefault: false,
    name: 'Archive drive',
    path: '/media/archive/ImageGen',
  },
]

const projects: HomeProjectRecord[] = [
  {
    displayName: 'Sample Project B',
    fileName: 'Sample Project B.igs',
    health: 'ready',
    height: 1184,
    id: 'sample-project-b',
    lastOpenedAt: '2026-07-10T13:42:00.000Z',
    layerCount: 5,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-07-10T13:42:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'emerald',
    width: 888,
    workspaceId: 'uncategorized',
  },
  {
    displayName: 'Sample Project A',
    fileName: 'Sample Project A.igs',
    health: 'ready',
    height: 1536,
    id: 'sample-project-a',
    lastOpenedAt: '2026-07-09T17:14:00.000Z',
    layerCount: 7,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-07-09T17:14:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'blue',
    width: 1024,
    workspaceId: 'uncategorized',
  },
  {
    displayName: 'Midnight greenhouse',
    fileName: 'Midnight greenhouse.igs',
    health: 'ready',
    height: 1152,
    id: 'midnight-greenhouse',
    lastOpenedAt: '2026-07-08T22:30:00.000Z',
    layerCount: 4,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-07-08T22:34:00.000Z',
    recoveryAvailable: true,
    thumbnailState: 'ready',
    thumbnailTone: 'rose',
    width: 768,
    workspaceId: 'uncategorized',
  },
  {
    displayName: 'NoobAI composition tests',
    fileName: 'NoobAI composition tests.igs',
    health: 'ready',
    height: 768,
    id: 'noobai-composition',
    lastOpenedAt: '2026-07-07T15:02:00.000Z',
    layerCount: 8,
    modelName: 'NoobAI XL v3',
    modifiedAt: '2026-07-07T15:08:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'gray',
    width: 1344,
    workspaceId: 'uncategorized',
  },
  {
    displayName: 'Smart patch costume pass',
    fileName: 'Smart patch costume pass.igs',
    health: 'ready',
    height: 1216,
    id: 'smart-patch-costume',
    lastOpenedAt: '2026-07-06T11:20:00.000Z',
    layerCount: 11,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-07-06T11:31:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'emerald',
    width: 832,
    workspaceId: 'character-studies',
  },
  {
    displayName: 'Archive character sheet',
    fileName: 'Archive character sheet.igs',
    health: 'missing',
    height: 1536,
    id: 'archive-character-sheet',
    lastOpenedAt: '2026-07-03T09:10:00.000Z',
    layerCount: 6,
    modifiedAt: '2026-07-03T09:10:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'missing',
    thumbnailTone: 'gray',
    width: 1024,
    workspaceId: 'archive-drive',
  },
  {
    displayName: 'Regional light study',
    fileName: 'Regional light study.igs',
    health: 'ready',
    height: 1024,
    id: 'regional-light-study',
    lastOpenedAt: '2026-07-01T13:10:00.000Z',
    layerCount: 9,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-07-01T13:25:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'rose',
    width: 1024,
    workspaceId: 'regional-drafts',
  },
  {
    displayName: 'Upscale comparison set',
    fileName: 'Upscale comparison set.igs',
    health: 'ready',
    height: 2048,
    id: 'upscale-comparison',
    lastOpenedAt: '2026-06-30T10:00:00.000Z',
    layerCount: 12,
    modelName: '4x NMKD Superscale',
    modifiedAt: '2026-06-30T10:40:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'blue',
    width: 1536,
    workspaceId: 'upscale-tests',
  },
  {
    displayName: 'Thumbnail rebuild study',
    fileName: 'Thumbnail rebuild study.igs',
    health: 'ready',
    height: 1024,
    id: 'thumbnail-rebuild',
    lastOpenedAt: '2026-06-28T12:00:00.000Z',
    layerCount: 3,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: '2026-06-28T12:15:00.000Z',
    recoveryAvailable: false,
    thumbnailState: 'missing',
    thumbnailTone: 'violet',
    width: 1024,
    workspaceId: 'character-studies',
  },
]

export function createHomeScenario(id: HomeScenarioId): HomeScenario {
  if (id === 'first-run') {
    return {
      hasInstalledModel: false,
      projects: [],
      workspaces: cloneWorkspaces().filter((workspace) => workspace.id === 'uncategorized'),
    }
  }

  if (id === 'problems') {
    const problemProjects = cloneProjects()
    problemProjects.push(
      {
        ...problemProjects[0]!,
        displayName: 'Damaged portrait study',
        fileName: 'Damaged portrait study.igs',
        health: 'corrupt',
        id: 'damaged-portrait',
        lastOpenedAt: '2026-06-27T09:00:00.000Z',
        modifiedAt: '2026-06-27T09:00:00.000Z',
        thumbnailTone: 'rose',
      },
      {
        ...problemProjects[0]!,
        displayName: 'Future schema concept',
        fileName: 'Future schema concept.igs',
        health: 'unsupported_schema',
        id: 'future-schema',
        lastOpenedAt: '2026-06-26T09:00:00.000Z',
        modifiedAt: '2026-06-26T09:00:00.000Z',
        thumbnailTone: 'violet',
      },
    )
    return { hasInstalledModel: true, projects: problemProjects, workspaces: cloneWorkspaces() }
  }

  return {
    hasInstalledModel: id !== 'no-model',
    projects: cloneProjects(),
    workspaces: cloneWorkspaces(),
  }
}

function cloneWorkspaces() {
  return structuredClone(workspaces)
}

function cloneProjects() {
  return structuredClone(projects)
}
