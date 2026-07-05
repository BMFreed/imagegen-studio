import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const prototypesDir = path.join(rootDir, 'docs', 'prototypes');
const screenshotsDir = path.join(prototypesDir, 'screenshots');

const prototypeArg = process.argv[2];

const prototypes = {
  'home-screen': 'home-screen.html',
  'model-manager': 'model-manager.html',
  'preset-manager': 'preset-manager.html',
  'apply-preset': 'apply-preset.html',
  'save-preset': 'save-preset.html',
  'project-page': 'project-page.html',
};

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1440', width: 1440, height: 900 },
];

const chromiumCandidates = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter(Boolean);

function findChromiumExecutable() {
  return chromiumCandidates.find((candidate) => existsSync(candidate));
}

function selectedPrototypes() {
  if (!prototypeArg) {
    return Object.entries(prototypes);
  }

  const fileName = prototypes[prototypeArg];

  if (!fileName) {
    const known = Object.keys(prototypes).join(', ');
    throw new Error(`Unknown prototype "${prototypeArg}". Expected one of: ${known}`);
  }

  return [[prototypeArg, fileName]];
}

await mkdir(screenshotsDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: findChromiumExecutable(),
  args: ['--no-sandbox'],
});

try {
  for (const [prototypeName, fileName] of selectedPrototypes()) {
    const url = pathToFileURL(path.join(prototypesDir, fileName)).href;

    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });

      await page.goto(url);
      await page.screenshot({
        path: path.join(screenshotsDir, `${prototypeName}-${viewport.name}.png`),
        fullPage: false,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Screenshots written to ${path.relative(rootDir, screenshotsDir)}`);
