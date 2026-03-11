import pages from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    pages(),
    devServer({
      entry: 'src/index.tsx'
    })
  ],
  build: {
    minify: true,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})
