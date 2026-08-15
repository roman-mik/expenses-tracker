import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react doesn't auto-register cleanup outside of Jest's
// global afterEach hook, so it's wired up explicitly for every jsdom test.
afterEach(() => {
  cleanup();
});
