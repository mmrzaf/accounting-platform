import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev proxy keeps the same HTTP API surface as the production Node server. */
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true,
      // Dev only: the browser origin is Vite's port, while backend CSRF checks its configured origin.
      configure(proxy) { proxy.on('proxyReq', upstream => upstream.setHeader('origin', 'http://127.0.0.1:3000')) },
    } } },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
})
