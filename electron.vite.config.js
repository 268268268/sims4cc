import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    // ponytail: pre-bundle Phosphor's ~1250-icon barrel into one file, or Vite dev
    // serves every icon as a separate module request → multi-second cold start
    optimizeDeps: {
      include: ['@phosphor-icons/react']
    },
    plugins: [react(), tailwindcss()]
  }
})
