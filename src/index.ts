// Main exports for playwright-visual-mask

// Core functionality
export * from './core/types';
export * from './core/config-manager';
export * from './core/image-processor';

// Playwright integration
export { test, expect, withMasks, getMaskConfig } from './plugin/fixture';
export type { VisualMaskFixtures, VisualSnapshotOptions } from './plugin/fixture';

// Server (for programmatic use)
export { createServer, ReviewServer } from './server';
export type { ServerOptions } from './server';
