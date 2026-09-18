// Builds the play-test rig into one JavaScript file, for a page that has to
// carry everything it needs: the engine, the world, and the interface.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./main.tsx', import.meta.url)),
      formats: ['iife'],
      name: 'DynastyPlaytest',
      fileName: () => 'playtest.js',
    },
  },
});
