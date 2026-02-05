import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'src/ui'),
  build: {
    outDir: path.join(__dirname, 'dist/ui'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5899',
    },
  },
});
