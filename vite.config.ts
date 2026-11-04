import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml(html) {
      return command === 'serve' ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') : html;
    }
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  base: './',
}));
