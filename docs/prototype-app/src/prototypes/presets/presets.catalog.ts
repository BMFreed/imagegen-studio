import { ref } from 'vue'

import { presetResources } from './presets.mock'
import { clonePreset } from './presets.utils'

// Shared for this prototype session; not a persistent resource registry.
export const presetCatalog = ref(presetResources.map(clonePreset))
