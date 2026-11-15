import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * vite.config.js
 *
 * Key configuration:
 *
 * 1. proxy — In DEVELOPMENT only, any request from the frontend to /api/...
 *    is automatically forwarded to the backend at localhost:4000.
 *    This avoids CORS issues during development because the browser thinks
 *    both frontend and backend are on the same origin (localhost:5173).
 *
 *    In PRODUCTION, the frontend talks directly to the deployed backend URL
 *    stored in import.meta.env.VITE_SERVER_URL.
 *
 * 2. server.port — Frontend runs on 5173 by default.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api calls to the backend during development
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
