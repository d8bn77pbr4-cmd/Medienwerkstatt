import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    env: { TZ: 'Europe/Berlin' },
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.ts'],
  },
});
