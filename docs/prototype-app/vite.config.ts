import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '..');

export default defineConfig({
  root: __dirname,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@docs-assets': path.resolve(docsDir, 'assets')
    }
  },
  server: {
    fs: {
      allow: [__dirname, docsDir]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
