import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // legacy/ is frozen reference material: Python and one deliberately
  // monolithic HTML file. It is never bundled.
  build: { target: 'es2022' },
});
