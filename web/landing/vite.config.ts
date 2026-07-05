import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build output IS the deployed site: Caddy bind-mounts server/landing read-only
// and serves it with plain file_server (exact paths, no try_files). index.html,
// privacy.html and terms.html must keep those exact URL shapes — the App Store
// listing references /privacy.html.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, '../../server/landing'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
      },
    },
  },
});
