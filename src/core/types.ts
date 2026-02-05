/**
 * Core types for playwright-stagemask
 */

/**
 * A rectangular mask region defined by coordinates
 * Coordinates can be absolute pixels or percentages (0-100)
 */
export interface MaskRegion {
  /** Unique identifier for this mask */
  id: string;
  /** X coordinate of top-left corner */
  x: number;
  /** Y coordinate of top-left corner */
  y: number;
  /** Width of the mask region */
  width: number;
  /** Height of the mask region */
  height: number;
  /** Whether coordinates are percentages (true) or pixels (false) */
  isPercentage: boolean;
  /** Optional description of why this area is masked */
  reason?: string;
  /** When this mask was created */
  createdAt: string;
}

/**
 * Configuration for a single screenshot
 */
export interface ScreenshotConfig {
  /** Name/path of the screenshot (matches toHaveScreenshot name) */
  name: string;
  /** Array of mask regions for this screenshot */
  masks: MaskRegion[];
  /** Last modified timestamp */
  updatedAt: string;
  /** Threshold for comparison (0-1, overrides global) */
  threshold?: number;
}

/**
 * Global configuration file structure
 */
export interface MaskConfig {
  /** Version of the config schema */
  version: number;
  /** Global comparison threshold (0-1) */
  threshold: number;
  /** Custom port for the review server */
  port?: number;
  /** Map of screenshot name to its configuration */
  screenshots: Record<string, ScreenshotConfig>;
}

/**
 * Result of a screenshot comparison
 */
export interface ComparisonResult {
  /** Whether the screenshots match (within threshold) */
  passed: boolean;
  /** Path to the baseline image */
  baselinePath: string;
  /** Path to the actual image */
  actualPath: string;
  /** Path to the diff image (if generated) */
  diffPath?: string;
  /** Number of different pixels */
  diffPixels: number;
  /** Percentage of different pixels */
  diffPercentage: number;
  /** Masks that were applied */
  appliedMasks: MaskRegion[];
  /** Screenshot dimensions */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Failed test information for the review UI
 */
export interface FailedScreenshot {
  /** Test file path */
  testFile: string;
  /** Describe block name (test suite) */
  describeName: string;
  /** Test block name */
  testName: string;
  /** Screenshot name */
  screenshotName: string;
  /** Full path to baseline image */
  baselinePath: string;
  /** Full path to actual image */
  actualPath: string;
  /** Full path to diff image */
  diffPath: string;
  /** When the test failed */
  failedAt: string;
  /** Comparison result details */
  comparison: ComparisonResult;
}

/**
 * WebSocket message types for real-time communication
 */
export type WSMessageType =
  | 'masks-updated'
  | 'test-rerun-requested'
  | 'test-result'
  | 'config-saved';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
}

/**
 * Options for the Playwright fixture
 */
export interface VisualMaskOptions {
  /** Path to the mask config file */
  configPath?: string;
  /** Whether to auto-update baselines on first run */
  updateBaselines?: boolean;
  /** Global threshold override */
  threshold?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: MaskConfig = {
  version: 1,
  threshold: 0.1,
  screenshots: {},
};

export const CONFIG_FILENAME = 'stage-masks.json';
export const DEFAULT_PORT = 5899;
