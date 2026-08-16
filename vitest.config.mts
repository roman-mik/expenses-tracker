import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const alias = { '@': path.resolve(import.meta.dirname, './src') };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['./src/test/setup-intl-server.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.itest.ts'],
          // Every file shares one running local Postgres — no isolated
          // per-test database — so tests within and across files must not
          // race each other.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
