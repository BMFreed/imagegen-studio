import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const children = new Set();
function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const vite = start('pnpm', ['exec', 'vite', '--config', 'vite.desktop.config.ts']);
let ready = false;
for (let attempt = 0; attempt < 100; attempt += 1) {
  if (vite.exitCode !== null) break;
  try {
    const response = await fetch('http://127.0.0.1:5174/');
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // The development server is still starting.
  }
  await delay(100);
}
if (!ready) {
  stop();
  throw new Error('Vite desktop server did not start.');
}

const build = start('node', ['scripts/build-electron.mjs']);
const buildExit = await new Promise((resolve) => build.once('exit', resolve));
if (buildExit !== 0) {
  stop();
  process.exitCode = buildExit ?? 1;
} else {
  const electronEnvironment = {
    ...process.env,
    IMAGEGEN_DEV_SERVER_URL: 'http://127.0.0.1:5174',
    NODE_ENV: 'development',
  };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;
  const electron = start('pnpm', ['exec', 'electron', '.'], {
    env: electronEnvironment,
  });
  process.exitCode = (await new Promise((resolve) => electron.once('exit', resolve))) ?? 1;
  stop();
}
