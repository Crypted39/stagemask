import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library and plugin
  {
    entry: {
      index: 'src/index.ts',
      'plugin/fixture': 'src/plugin/fixture.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['@playwright/test'],
  },
  // CLI (CommonJS only, with shebang)
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['@playwright/test'],
  },
]);
