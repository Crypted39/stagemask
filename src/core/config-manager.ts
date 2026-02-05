import * as fs from 'fs';
import * as path from 'path';
import {
  MaskConfig,
  ScreenshotConfig,
  MaskRegion,
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
} from './types';

/**
 * Manages the visual mask configuration file
 */
export class ConfigManager {
  private configPath: string;
  private config: MaskConfig;

  constructor(projectRoot?: string) {
    const root = projectRoot || process.cwd();
    this.configPath = path.join(root, CONFIG_FILENAME);
    this.config = this.load();
  }

  /**
   * Load configuration from disk
   */
  private load(): MaskConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(content) as MaskConfig;
        return this.migrate(parsed);
      }
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}:`, error);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Migrate config to latest version if needed
   */
  private migrate(config: MaskConfig): MaskConfig {
    // Future migrations can be added here
    if (!config.version) {
      config.version = 1;
    }
    // Ensure screenshots object exists
    if (!config.screenshots) {
      config.screenshots = {};
    }
    // Ensure threshold exists
    if (config.threshold === undefined) {
      config.threshold = 0.1;
    }
    return config;
  }

  /**
   * Save configuration to disk
   */
  save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * Get the full config
   */
  getConfig(): MaskConfig {
    return this.config;
  }

  /**
   * Get configuration for a specific screenshot
   */
  getScreenshotConfig(name: string): ScreenshotConfig | undefined {
    return this.config.screenshots[name];
  }

  /**
   * Get masks for a specific screenshot
   */
  getMasks(screenshotName: string): MaskRegion[] {
    if (!this.config.screenshots) {
      return [];
    }
    return this.config.screenshots[screenshotName]?.masks || [];
  }

  /**
   * Set masks for a specific screenshot
   */
  setMasks(screenshotName: string, masks: MaskRegion[]): void {
    if (!this.config.screenshots[screenshotName]) {
      this.config.screenshots[screenshotName] = {
        name: screenshotName,
        masks: [],
        updatedAt: new Date().toISOString(),
      };
    }
    this.config.screenshots[screenshotName].masks = masks;
    this.config.screenshots[screenshotName].updatedAt = new Date().toISOString();
  }

  /**
   * Add a mask to a screenshot
   */
  addMask(
    screenshotName: string,
    mask: Omit<MaskRegion, 'id' | 'createdAt'>,
  ): MaskRegion {
    const newMask: MaskRegion = {
      ...mask,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
    };

    if (!this.config.screenshots[screenshotName]) {
      this.config.screenshots[screenshotName] = {
        name: screenshotName,
        masks: [],
        updatedAt: new Date().toISOString(),
      };
    }

    this.config.screenshots[screenshotName].masks.push(newMask);
    this.config.screenshots[screenshotName].updatedAt = new Date().toISOString();

    return newMask;
  }

  /**
   * Remove a mask by ID
   */
  removeMask(screenshotName: string, maskId: string): boolean {
    const screenshot = this.config.screenshots[screenshotName];
    if (!screenshot) return false;

    const index = screenshot.masks.findIndex((m) => m.id === maskId);
    if (index === -1) return false;

    screenshot.masks.splice(index, 1);
    screenshot.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Update an existing mask
   */
  updateMask(
    screenshotName: string,
    maskId: string,
    updates: Partial<MaskRegion>,
  ): boolean {
    const screenshot = this.config.screenshots[screenshotName];
    if (!screenshot) return false;

    const mask = screenshot.masks.find((m) => m.id === maskId);
    if (!mask) return false;

    Object.assign(mask, updates, { id: maskId }); // Preserve ID
    screenshot.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Set threshold for a specific screenshot
   */
  setThreshold(screenshotName: string, threshold: number): void {
    if (!this.config.screenshots[screenshotName]) {
      this.config.screenshots[screenshotName] = {
        name: screenshotName,
        masks: [],
        updatedAt: new Date().toISOString(),
      };
    }
    this.config.screenshots[screenshotName].threshold = threshold;
    this.config.screenshots[screenshotName].updatedAt = new Date().toISOString();
  }

  /**
   * Get global threshold
   */
  getGlobalThreshold(): number {
    return this.config.threshold;
  }

  /**
   * Set global threshold
   */
  setGlobalThreshold(threshold: number): void {
    this.config.threshold = threshold;
  }

  /**
   * Get custom port (returns undefined if not set)
   */
  getPort(): number | undefined {
    return this.config.port;
  }

  /**
   * Set custom port
   */
  setPort(port: number): void {
    this.config.port = port;
  }

  /**
   * Clear custom port (revert to default)
   */
  clearPort(): void {
    delete this.config.port;
  }

  /**
   * Get effective threshold for a screenshot (screenshot-specific or global)
   */
  getEffectiveThreshold(screenshotName: string): number {
    return this.config.screenshots[screenshotName]?.threshold ?? this.config.threshold;
  }

  /**
   * Get path to config file
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Generate a unique ID for masks
   */
  private generateId(): string {
    return `mask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export config for specific screenshots (useful for sharing)
   */
  exportForScreenshots(names: string[]): Partial<MaskConfig> {
    const screenshots: Record<string, ScreenshotConfig> = {};
    for (const name of names) {
      if (this.config.screenshots[name]) {
        screenshots[name] = this.config.screenshots[name];
      }
    }
    return {
      version: this.config.version,
      threshold: this.config.threshold,
      screenshots,
    };
  }

  /**
   * Import masks from another config (merge)
   */
  importMasks(config: Partial<MaskConfig>): void {
    if (config.screenshots) {
      for (const [name, screenshot] of Object.entries(config.screenshots)) {
        if (!this.config.screenshots[name]) {
          this.config.screenshots[name] = screenshot;
        } else {
          // Merge masks, avoiding duplicates by position
          const existingMasks = this.config.screenshots[name].masks;
          for (const mask of screenshot.masks) {
            const isDuplicate = existingMasks.some(
              (m) =>
                m.x === mask.x &&
                m.y === mask.y &&
                m.width === mask.width &&
                m.height === mask.height,
            );
            if (!isDuplicate) {
              existingMasks.push({ ...mask, id: this.generateId() });
            }
          }
          this.config.screenshots[name].updatedAt = new Date().toISOString();
        }
      }
    }
  }
}
