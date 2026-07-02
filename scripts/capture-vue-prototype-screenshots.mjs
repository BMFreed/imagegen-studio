import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'docs', 'prototype-app');
const screenshotsDir = path.join(appDir, 'screenshots');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const port = 5174;
const baseUrl = `http://127.0.0.1:${port}`;

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

function checkUrl(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20_000) {
    if (await checkUrl(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for prototype dev server at ${url}`);
}

async function stopServer(serverProcess) {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    return;
  }

  serverProcess.kill('SIGTERM');

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess.kill('SIGKILL');
      resolve();
    }, 2500);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

if (!existsSync(viteBin)) {
  throw new Error('Vite is not installed. Run npm install before capturing prototype screenshots.');
}

await mkdir(screenshotsDir, { recursive: true });

const serverProcess = spawn(process.execPath, [
  viteBin,
  '--config',
  path.join(appDir, 'vite.config.ts'),
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--strictPort'
], {
  cwd: rootDir,
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(baseUrl);

  const browser = await chromium.launch({
    executablePath: findChromiumExecutable(),
    args: ['--no-sandbox']
  });

  try {
    const shots = [
      { name: 'model-manager-desktop-1920.png', width: 1920, height: 1080, openImport: false },
      { name: 'model-manager-laptop-1440.png', width: 1440, height: 900, openImport: false },
      { name: 'model-manager-import-dialog-1920.png', width: 1920, height: 1080, openImport: true }
    ];

    for (const shot of shots) {
      const page = await browser.newPage({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 1
      });

      await page.goto(baseUrl);

      if (shot.openImport) {
        await page.getByRole('button', { name: 'Add from CivitAI URL' }).click();
        await page.locator('.import-dialog').waitFor({ state: 'visible' });
        await page.waitForTimeout(250);
      }

      await page.screenshot({
        path: path.join(screenshotsDir, shot.name),
        fullPage: false
      });

      await page.close();
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  await stopServer(serverProcess);
}

console.log(`Vue prototype screenshots written to ${path.relative(rootDir, screenshotsDir)}`);
