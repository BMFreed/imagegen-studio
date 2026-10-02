import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig } from 'vite'

const __dirname = import.meta.dirname
const docsDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(docsDir, '..')

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@docs-assets': path.resolve(docsDir, 'assets'),
    },
  },
  root: __dirname,
  server: {
    fs: {
      allow: [
        __dirname,
        docsDir,
        path.join(repoRoot, 'src', 'renderer'),
        path.join(repoRoot, 'src', 'shared'),
      ],
    },
  },
})
