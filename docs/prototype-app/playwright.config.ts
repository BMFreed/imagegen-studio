import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const __dirname = import.meta.dirname
const rootDir = path.resolve(__dirname, '..', '..')
const port = 5174
const chromiumPath = process.env['CHROMIUM_PATH']

const chromiumCandidates = [
  ...(chromiumPath ? [chromiumPath] : []),
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
]

function findChromiumExecutable() {
  return chromiumCandidates.find((candidate) => existsSync(candidate))
}

const executablePath = findChromiumExecutable()

export default defineConfig({
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    browserName: 'chromium',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --config docs/prototype-app/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: rootDir,
    reuseExistingServer: !process.env['CI'],
    timeout: 20_000,
    url: `http://127.0.0.1:${port}/`,
  },
})
