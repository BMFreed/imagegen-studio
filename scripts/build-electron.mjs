import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const outDir = path.resolve('dist');

await Promise.all([
  build({
    entryPoints: ['src/main/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile: path.join(outDir, 'main/main.cjs'),
    external: ['electron', 'better-sqlite3'],
    sourcemap: true,
  }),
  build({
    entryPoints: ['src/preload/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile: path.join(outDir, 'preload/preload.cjs'),
    external: ['electron'],
    sourcemap: true,
  }),
]);

const migrationsOutDir = path.join(outDir, 'main/migrations');
await rm(migrationsOutDir, { force: true, recursive: true });
await mkdir(migrationsOutDir, { recursive: true });
await cp('src/main/db/migrations', migrationsOutDir, {
  recursive: true,
});
