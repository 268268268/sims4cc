import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: ['@phosphor-icons/react']
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
