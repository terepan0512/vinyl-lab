import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/analyze': { target: 'http://127.0.0.1:8787', timeout: 300000, proxyTimeout: 300000 },
      '/api/train-color': { target: 'http://127.0.0.1:8787', timeout: 300000, proxyTimeout: 300000 },
    },
  },
})
