import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Set base to repo name for GitHub Pages (change 'grok-bud' to your repo name if different)
  base: process.env.NODE_ENV === 'production' ? '/grok-bud/' : '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
