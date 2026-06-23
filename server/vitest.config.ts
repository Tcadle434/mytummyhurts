import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/setup-env.ts'],
  },
  // SWC transform emits the decorator metadata (design:paramtypes) that NestJS
  // dependency injection relies on — esbuild (vitest's default) does not.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
