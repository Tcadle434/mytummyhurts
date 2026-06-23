import { defineConfig } from 'vitest/config';

// The Expo app's tests live under src/. The NestJS backend (server/) and shared
// packages have their own test runners/config — never glob into them from root.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['server/**', 'packages/**', 'node_modules/**'],
  },
});
