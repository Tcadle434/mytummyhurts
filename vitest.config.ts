import path from 'node:path';

import { defineConfig } from 'vitest/config';

// The Expo app's tests live under src/. The NestJS backend (server/) and shared
// packages have their own test runners/config — never glob into them from root.
export default defineConfig({
  resolve: {
    alias: {
      '@mth/shared-domain': path.resolve(__dirname, 'packages/shared-domain/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['server/**', 'packages/**', 'node_modules/**'],
  },
});
