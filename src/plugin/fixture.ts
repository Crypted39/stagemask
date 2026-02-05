import {
  test as base,
  expect,
  type Page,
  type Locator,
  type PageScreenshotOptions,
  type TestInfo,
} from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from '../core/config-manager';
import { MaskRegion, CONFIG_FILENAME } from '../core/types';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Extended test fixture that adds visual mask functionality
 */
export interface VisualMaskFixtures {
  /**
   * Take a screenshot with automatic mask application.
   * Throws immediately if the screenshot doesn't match (hard assertion).
   */
  visualSnapshot: (name: string, options?: VisualSnapshotOptions) => Promise<void>;

  /**
   * Take a screenshot with automatic mask application (soft assertion).
   * Collects failures without throwing immediately - test continues running.
   * All failures are thrown at the end of the test.
   */
  softVisualSnapshot: (name: string, options?: VisualSnapshotOptions) => Promise<void>;
}

export interface VisualSnapshotOptions {
  /** Element to screenshot (full page if not specified) */
  element?: Locator;
  /** Additional masks to apply (merged with config masks) */
  masks?: Array<{ x: number; y: number; width: number; height: number }>;
  /** Threshold override for this specific comparison */
  threshold?: number;
  /** Whether to update the baseline */
  updateBaseline?: boolean;
  /** Playwright screenshot options */
  screenshotOptions?: PageScreenshotOptions;
}

/**
 * Result of a snapshot comparison
 */
interface SnapshotResult {
  passed: boolean;
  error?: string;
  screenshotName: string;
  diffPixels?: number;
  diffPercentage?: number;
}

// Store config manager instance per test run
let configManager: ConfigManager | null = null;

function getConfigManager(): ConfigManager {
  if (!configManager) {
    const cwd = process.cwd();
    const configPath = path.join(cwd, CONFIG_FILENAME);
    console.log(`[stagemask] Config path: ${configPath}`);
    console.log(`[stagemask] Config exists: ${fs.existsSync(configPath)}`);
    if (fs.existsSync(configPath)) {
      console.log(
        `[stagemask] Config content: ${fs.readFileSync(configPath, 'utf-8').substring(0, 200)}...`,
      );
    }
    configManager = new ConfigManager(cwd);
  }
  return configManager;
}

/**
 * Apply masks to an image by filling masked regions with a solid color
 */
function applyMasksToImage(
  png: PNG,
  masks: Array<{ x: number; y: number; width: number; height: number }>,
  color: { r: number; g: number; b: number } = { r: 255, g: 0, b: 255 }, // Magenta
): void {
  for (const mask of masks) {
    const startX = Math.max(0, Math.floor(mask.x));
    const startY = Math.max(0, Math.floor(mask.y));
    const endX = Math.min(png.width, Math.ceil(mask.x + mask.width));
    const endY = Math.min(png.height, Math.ceil(mask.y + mask.height));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (png.width * y + x) * 4;
        png.data[idx] = color.r; // R
        png.data[idx + 1] = color.g; // G
        png.data[idx + 2] = color.b; // B
        png.data[idx + 3] = 255; // A
      }
    }
  }
}

/**
 * Core snapshot comparison logic - shared between hard and soft assertions
 */
async function performSnapshotComparison(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: VisualSnapshotOptions = {},
): Promise<SnapshotResult> {
  const config = getConfigManager();
  const configMasks = config.getMasks(name);
  const threshold = options.threshold ?? config.getEffectiveThreshold(name);

  console.log(`[stagemask] Screenshot "${name}": found ${configMasks.length} masks`);
  if (configMasks.length > 0) {
    console.log(`[stagemask] Masks:`, JSON.stringify(configMasks, null, 2));
  }

  // Merge config masks with inline masks
  const allMasks: MaskRegion[] = [
    ...configMasks,
    ...(options.masks || []).map((m, i) => ({
      ...m,
      id: `inline_${i}`,
      isPercentage: false,
      createdAt: new Date().toISOString(),
    })),
  ];

  // Take the screenshot
  let screenshotBuffer: Buffer;
  if (options.element) {
    screenshotBuffer = await options.element.screenshot({
      ...options.screenshotOptions,
    });
  } else {
    screenshotBuffer = await page.screenshot({
      fullPage: false,
      ...options.screenshotOptions,
    });
  }

  // Convert masks to image-relative coordinates
  const imageMasks = allMasks.map((mask) => ({
    x: mask.x,
    y: mask.y,
    width: mask.width,
    height: mask.height,
  }));

  // Determine snapshot path
  const snapshotDir = testInfo.snapshotDir;
  const snapshotSuffix = testInfo.snapshotSuffix;
  const snapshotName = snapshotSuffix
    ? `${name.replace('.png', '')}-${snapshotSuffix}.png`
    : name;
  const snapshotPath = path.join(snapshotDir, snapshotName);

  console.log(`[stagemask] Snapshot path: ${snapshotPath}`);

  // Check if we should update baselines
  const shouldUpdate =
    options.updateBaseline || testInfo.config.updateSnapshots === 'all';
  const baselineExists = fs.existsSync(snapshotPath);

  // First run or update mode: create/update baseline and return success
  if (!baselineExists || shouldUpdate) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, screenshotBuffer);
    if (!baselineExists) {
      console.log(`[stagemask] Created baseline: ${snapshotPath}`);
    } else {
      console.log(`[stagemask] Updated baseline: ${snapshotPath}`);
    }
    return { passed: true, screenshotName: name };
  }

  // Comparison mode: compare actual vs baseline
  console.log(`[stagemask] Comparing against baseline...`);

  // Load baseline and actual images
  const baselinePng = PNG.sync.read(fs.readFileSync(snapshotPath));
  const actualPng = PNG.sync.read(screenshotBuffer);

  // Check dimensions match
  if (baselinePng.width !== actualPng.width || baselinePng.height !== actualPng.height) {
    const error =
      `Screenshot "${name}" dimensions don't match. ` +
      `Baseline: ${baselinePng.width}x${baselinePng.height}, ` +
      `Actual: ${actualPng.width}x${actualPng.height}`;
    return { passed: false, error, screenshotName: name };
  }

  // Clone images for comparison (so we don't modify originals for saving)
  const baselineForCompare = new PNG({
    width: baselinePng.width,
    height: baselinePng.height,
  });
  const actualForCompare = new PNG({
    width: actualPng.width,
    height: actualPng.height,
  });
  baselinePng.data.copy(baselineForCompare.data);
  actualPng.data.copy(actualForCompare.data);

  // Apply masks to BOTH images before comparison
  if (imageMasks.length > 0) {
    console.log(
      `[stagemask] Applying ${imageMasks.length} masks to both images for comparison`,
    );
    applyMasksToImage(baselineForCompare, imageMasks);
    applyMasksToImage(actualForCompare, imageMasks);
  }

  // Create diff image
  const diffPng = new PNG({
    width: baselinePng.width,
    height: baselinePng.height,
  });

  // Compare with pixelmatch
  const diffPixels = pixelmatch(
    baselineForCompare.data,
    actualForCompare.data,
    diffPng.data,
    baselinePng.width,
    baselinePng.height,
    { threshold: threshold },
  );

  const totalPixels = baselinePng.width * baselinePng.height;
  const diffRatio = diffPixels / totalPixels;

  console.log(
    `[stagemask] Comparison result: ${diffPixels} different pixels (${(diffRatio * 100).toFixed(4)}%)`,
  );

  if (diffPixels > 0) {
    // Save diff, actual, and expected images for debugging and for the review UI
    const outputDir = testInfo.outputDir;
    fs.mkdirSync(outputDir, { recursive: true });

    const baseName = name.replace('.png', '');
    const actualPath = path.join(outputDir, `${baseName}-actual.png`);
    const expectedPath = path.join(outputDir, `${baseName}-expected.png`);
    const diffPath = path.join(outputDir, `${baseName}-diff.png`);
    const metadataPath = path.join(outputDir, `${baseName}-metadata.json`);

    // Save actual screenshot
    fs.writeFileSync(actualPath, screenshotBuffer);
    // Copy baseline as expected (for the review UI to find)
    fs.copyFileSync(snapshotPath, expectedPath);
    // Save diff image
    fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

    // Save metadata for the review UI
    const titlePath = testInfo.titlePath;
    const testFile = testInfo.file ? path.basename(testInfo.file) : 'unknown';

    console.log(`[stagemask] titlePath: ${JSON.stringify(titlePath)}`);
    console.log(`[stagemask] testFile: ${testFile}`);

    // Extract describe blocks and test name from titlePath
    const pathWithoutProject = titlePath.slice(1);
    const testName =
      pathWithoutProject.length > 0
        ? pathWithoutProject[pathWithoutProject.length - 1]
        : 'Unknown Test';
    const describePath = pathWithoutProject.slice(0, -1);
    const describeName = describePath.length > 0 ? describePath.join(' › ') : 'Tests';

    console.log(
      `[stagemask] Parsed - describeName: "${describeName}", testName: "${testName}"`,
    );

    const metadata = {
      screenshotName: name,
      testFile,
      describeName,
      testName,
      diffPixels,
      diffPercentage: diffRatio * 100,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Attach to test results
    await testInfo.attach(baseName, {
      body: screenshotBuffer,
      contentType: 'image/png',
    });

    const error =
      `Screenshot "${name}" differs from baseline.\n` +
      `${diffPixels} pixels (${(diffRatio * 100).toFixed(4)}%) are different.\n` +
      `Baseline: ${snapshotPath}\n` +
      `Actual: ${actualPath}\n` +
      `Diff: ${diffPath}`;

    return {
      passed: false,
      error,
      screenshotName: name,
      diffPixels,
      diffPercentage: diffRatio * 100,
    };
  }

  console.log(`[stagemask] Screenshot "${name}" matches baseline.`);
  return { passed: true, screenshotName: name };
}

/**
 * Extended test with visual mask fixtures
 */
export const test = base.extend<VisualMaskFixtures>({
  visualSnapshot: async ({ page }, use, testInfo) => {
    const snapshot = async (name: string, options: VisualSnapshotOptions = {}) => {
      const result = await performSnapshotComparison(page, testInfo, name, options);
      if (!result.passed && result.error) {
        throw new Error(result.error);
      }
    };

    await use(snapshot);
  },

  softVisualSnapshot: async ({ page }, use, testInfo) => {
    // Collect all soft assertion failures
    const failures: SnapshotResult[] = [];

    const softSnapshot = async (name: string, options: VisualSnapshotOptions = {}) => {
      const result = await performSnapshotComparison(page, testInfo, name, options);
      if (!result.passed) {
        failures.push(result);
        console.log(`[stagemask] Soft assertion failed for "${name}" - continuing test`);
      }
    };

    await use(softSnapshot);

    // After the test completes, throw if there were any failures
    if (failures.length > 0) {
      const failureMessages = failures
        .map(
          (f, i) =>
            `${i + 1}. ${f.screenshotName}: ${f.diffPixels} pixels different (${f.diffPercentage?.toFixed(4)}%)`,
        )
        .join('\n');

      throw new Error(
        `${failures.length} visual snapshot(s) failed:\n${failureMessages}\n\n` +
          `Use 'npx stagemask review' to inspect and add masks.`,
      );
    }
  },
});

/**
 * Helper function to use with standard toHaveScreenshot
 */
export function withMasks(
  screenshotName: string,
  options: {
    configPath?: string;
    additionalMasks?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  } = {},
): { mask?: Locator[]; threshold?: number } {
  const config = new ConfigManager(options.configPath || process.cwd());
  const threshold = config.getEffectiveThreshold(screenshotName);

  return {
    threshold,
  };
}

/**
 * Create mask options for toHaveScreenshot from stored config
 */
export function getMaskConfig(screenshotName: string): {
  masks: MaskRegion[];
  threshold: number;
} {
  const config = getConfigManager();
  return {
    masks: config.getMasks(screenshotName),
    threshold: config.getEffectiveThreshold(screenshotName),
  };
}

// Re-export expect for convenience
export { expect };
