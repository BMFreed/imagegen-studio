import { createConfig, Preset } from 'productive-eslint';

export default createConfig({
  ignores: [
    'docs/prototype-app/dist/**',
    'docs/prototype-app/playwright-report/**',
    'docs/prototype-app/screenshots/**',
    'docs/prototype-app/test-results/**',
    'docs/prototypes/screenshots/**',
  ],
  preset: Preset.AUTO_FIXABLE,
  rxjs: false,
  vue: true,
});
