import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: path.join(rootDir, 'dist/renderer'),
  },
  plugins: [vue()],
  root: path.join(rootDir, 'src/renderer'),
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
})
