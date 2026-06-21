import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from '@vue/server-renderer';
import { h } from 'vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'docs', 'assets', 'icons', 'tabler');

const icons = [
  'AdjustmentsHorizontal',
  'ArrowBackUp',
  'ArrowForwardUp',
  'ArrowsMaximize',
  'Box',
  'Brush',
  'ChevronDown',
  'ChevronLeft',
  'ChevronRight',
  'Copy',
  'Crop',
  'DeviceFloppy',
  'Download',
  'Eraser',
  'Eye',
  'EyeOff',
  'Folder',
  'HandMove',
  'Home',
  'InfoCircle',
  'Lasso',
  'LayersSubtract',
  'Lock',
  'Menu2',
  'PlayerPause',
  'PlayerPlay',
  'Polygon',
  'Plus',
  'Refresh',
  'Search',
  'Select',
  'Settings',
  'Stars',
  'Trash',
  'Wand',
  'X',
  'ZoomIn',
  'ZoomOut'
];

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

async function renderIcon(name) {
  const mod = await import(`@vicons/tabler/${name}.js`);
  const IconComponent = mod.default?.default ?? mod.default ?? mod[name];

  if (!IconComponent) {
    throw new Error(`Icon ${name} was not exported by @vicons/tabler`);
  }

  const html = await renderToString(
    h(IconComponent, {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '24',
      height: '24',
      'aria-hidden': 'true',
      focusable: 'false'
    })
  );

  return html
    .replace(/\sdata-v-[a-f0-9]+=""/g, '')
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/currentColor/g, 'currentColor')
    .trim();
}

await mkdir(outputDir, { recursive: true });

for (const iconName of icons) {
  const svg = await renderIcon(iconName);
  const fileName = `${toKebabCase(iconName)}.svg`;
  await writeFile(path.join(outputDir, fileName), `${svg}\n`, 'utf8');
}

console.log(`Exported ${icons.length} Tabler icons to ${path.relative(rootDir, outputDir)}`);
