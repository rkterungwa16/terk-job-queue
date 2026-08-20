import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forwards /api/* to the backend during `npm run dev` so the dashboard
    // can call apiGet('/admin/queue/stats') etc. without CORS setup.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
