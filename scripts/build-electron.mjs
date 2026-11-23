import { execFileSync } from 'node:child_process';
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
    external: ['electron', 'better-sqlite3', 'electron-updater'],
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

const placeholdersOutDir = path.join(outDir, 'main/placeholders');
await rm(placeholdersOutDir, { force: true, recursive: true });
await mkdir(placeholdersOutDir, { recursive: true });
await cp('src/main/projects/placeholders', placeholdersOutDir, {
  recursive: true,
});

if (process.platform === 'linux') {
  const nativeOutDir = path.join(outDir, 'native');
  const walletBootstrap = path.join(nativeOutDir, 'igs-wallet-bootstrap');
  await mkdir(nativeOutDir, { recursive: true });
  await rm(walletBootstrap, { force: true });

  const gioFlags = execFileSync('pkg-config', ['--cflags', '--libs', 'gio-2.0 >= 2.56'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .trim()
    .split(/\s+/);

  execFileSync(
    'cc',
    [
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Wpedantic',
      '-Werror',
      '-DGLIB_VERSION_MIN_REQUIRED=GLIB_VERSION_2_56',
      '-DGLIB_VERSION_MAX_ALLOWED=GLIB_VERSION_2_56',
      '-o',
      walletBootstrap,
      'src/main/native/kwallet-bootstrap.c',
      ...gioFlags,
    ],
    { stdio: 'inherit' },
  );
}
