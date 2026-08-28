import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron 以 file:// 加载时，crossorigin 会触发 CORS 拦截导致空白窗口，这里统一去掉
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml: (html: string) => html.replace(/\s+crossorigin/g, ''),
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
