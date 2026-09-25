import { createConfig, Preset } from 'productive-eslint'

export default createConfig({
  ignores: [
    'docs/prototype-app/dist/**',
    'docs/prototype-app/playwright-report/**',
    'docs/prototype-app/screenshots/**',
    'docs/prototype-app/test-results/**',
    // Python runtime has its own Ruff/BasedPyright checks; ESLint's TOML formatter does not
    // understand uv's generated lockfile or Python packaging metadata.
    'worker-python/**',
  ],
  preset: Preset.AUTO_FIXABLE,
  rxjs: false,
  vue: true,
})
