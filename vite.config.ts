import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // legacy/ is frozen reference material: Python, the seed CSVs and one
  // deliberately monolithic HTML file. It is never bundled: nothing under src/
  // may import it, and scripts/lint-arch.mjs (rule 6) fails the build if
  // something does. The seed reaches the client as rows, through Postgres.
  build: { target: 'es2022' },
});
