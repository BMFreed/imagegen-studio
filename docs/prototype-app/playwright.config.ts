import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const port = 5174;

const chromiumCandidates = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome'
].filter(Boolean);

function findChromiumExecutable() {
  return chromiumCandidates.find((candidate) => existsSync(candidate));
}

const executablePath = findChromiumExecutable();

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  webServer: {
    command: `pnpm exec vite --config docs/prototype-app/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: rootDir,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox']
    }
  }
});
