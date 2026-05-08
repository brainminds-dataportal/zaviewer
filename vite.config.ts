import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': '{}',
  },
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '^/dataportal/': {
        target: 'https://dataportal.brainminds.jp/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dataportal/, ''),
      },
    },
  },
});
