import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { MaskRegion, ComparisonResult } from './types';

/**
 * Handles image processing operations including mask application and comparison
 */
export class ImageProcessor {
  /**
   * Load a PNG image from disk
   */
  async loadImage(imagePath: string): Promise<PNG> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(imagePath)) {
        reject(new Error(`Image not found: ${imagePath}`));
        return;
      }

      const png = new PNG();
      fs.createReadStream(imagePath)
        .pipe(png)
        .on('parsed', function () {
          resolve(this);
        })
        .on('error', reject);
    });
  }

  /**
   * Save a PNG image to disk
   */
  async saveImage(image: PNG, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const buffer = PNG.sync.write(image);
      fs.writeFile(outputPath, buffer, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Convert percentage-based mask to pixel coordinates
   */
  convertMaskToPixels(
    mask: MaskRegion,
    imageWidth: number,
    imageHeight: number,
  ): { x: number; y: number; width: number; height: number } {
    if (!mask.isPercentage) {
      return {
        x: Math.round(mask.x),
        y: Math.round(mask.y),
        width: Math.round(mask.width),
        height: Math.round(mask.height),
      };
    }

    return {
      x: Math.round((mask.x / 100) * imageWidth),
      y: Math.round((mask.y / 100) * imageHeight),
      width: Math.round((mask.width / 100) * imageWidth),
      height: Math.round((mask.height / 100) * imageHeight),
    };
  }

  /**
   * Apply masks to an image by setting masked pixels to a specific color
   * Returns a new PNG with masks applied (doesn't modify original)
   */
  applyMasks(
    image: PNG,
    masks: MaskRegion[],
    maskColor = { r: 255, g: 0, b: 255, a: 255 },
  ): PNG {
    // Create a copy
    const masked = new PNG({ width: image.width, height: image.height });
    image.data.copy(masked.data);

    for (const mask of masks) {
      const { x, y, width, height } = this.convertMaskToPixels(
        mask,
        image.width,
        image.height,
      );

      // Clamp values to image bounds
      const startX = Math.max(0, x);
      const startY = Math.max(0, y);
      const endX = Math.min(image.width, x + width);
      const endY = Math.min(image.height, y + height);

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * image.width + px) * 4;
          masked.data[idx] = maskColor.r;
          masked.data[idx + 1] = maskColor.g;
          masked.data[idx + 2] = maskColor.b;
          masked.data[idx + 3] = maskColor.a;
        }
      }
    }

    return masked;
  }

  /**
   * Create a visual representation of masks on an image (for preview)
   * Uses semi-transparent overlay instead of solid color
   */
  createMaskPreview(
    image: PNG,
    masks: MaskRegion[],
    overlayColor = { r: 255, g: 0, b: 0, a: 100 },
  ): PNG {
    const preview = new PNG({ width: image.width, height: image.height });
    image.data.copy(preview.data);

    for (const mask of masks) {
      const { x, y, width, height } = this.convertMaskToPixels(
        mask,
        image.width,
        image.height,
      );

      const startX = Math.max(0, x);
      const startY = Math.max(0, y);
      const endX = Math.min(image.width, x + width);
      const endY = Math.min(image.height, y + height);

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * image.width + px) * 4;

          // Alpha blend
          const alpha = overlayColor.a / 255;
          preview.data[idx] = Math.round(
            preview.data[idx] * (1 - alpha) + overlayColor.r * alpha,
          );
          preview.data[idx + 1] = Math.round(
            preview.data[idx + 1] * (1 - alpha) + overlayColor.g * alpha,
          );
          preview.data[idx + 2] = Math.round(
            preview.data[idx + 2] * (1 - alpha) + overlayColor.b * alpha,
          );
        }
      }

      // Draw border
      this.drawRectBorder(preview, startX, startY, endX - startX, endY - startY, {
        r: 255,
        g: 0,
        b: 0,
        a: 255,
      });
    }

    return preview;
  }

  /**
   * Draw a rectangle border on an image
   */
  private drawRectBorder(
    image: PNG,
    x: number,
    y: number,
    width: number,
    height: number,
    color: { r: number; g: number; b: number; a: number },
    thickness = 2,
  ): void {
    const setPixel = (px: number, py: number) => {
      if (px >= 0 && px < image.width && py >= 0 && py < image.height) {
        const idx = (py * image.width + px) * 4;
        image.data[idx] = color.r;
        image.data[idx + 1] = color.g;
        image.data[idx + 2] = color.b;
        image.data[idx + 3] = color.a;
      }
    };

    // Top and bottom borders
    for (let px = x; px < x + width; px++) {
      for (let t = 0; t < thickness; t++) {
        setPixel(px, y + t);
        setPixel(px, y + height - 1 - t);
      }
    }

    // Left and right borders
    for (let py = y; py < y + height; py++) {
      for (let t = 0; t < thickness; t++) {
        setPixel(x + t, py);
        setPixel(x + width - 1 - t, py);
      }
    }
  }

  /**
   * Compare two images with optional masks
   */
  async compare(
    baselinePath: string,
    actualPath: string,
    masks: MaskRegion[] = [],
    threshold = 0.1,
  ): Promise<ComparisonResult> {
    const baseline = await this.loadImage(baselinePath);
    const actual = await this.loadImage(actualPath);

    // Apply masks to both images
    const maskedBaseline = masks.length > 0 ? this.applyMasks(baseline, masks) : baseline;
    const maskedActual = masks.length > 0 ? this.applyMasks(actual, masks) : actual;

    // Handle size mismatch
    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      return {
        passed: false,
        baselinePath,
        actualPath,
        diffPixels: -1,
        diffPercentage: 100,
        appliedMasks: masks,
        dimensions: {
          width: actual.width,
          height: actual.height,
        },
      };
    }

    // Create diff image
    const diff = new PNG({ width: baseline.width, height: baseline.height });

    const diffPixels = pixelmatch(
      maskedBaseline.data,
      maskedActual.data,
      diff.data,
      baseline.width,
      baseline.height,
      { threshold },
    );

    const totalPixels = baseline.width * baseline.height;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    return {
      passed: diffPixels === 0,
      baselinePath,
      actualPath,
      diffPixels,
      diffPercentage,
      appliedMasks: masks,
      dimensions: {
        width: baseline.width,
        height: baseline.height,
      },
    };
  }

  /**
   * Generate and save a diff image
   */
  async generateDiff(
    baselinePath: string,
    actualPath: string,
    outputPath: string,
    masks: MaskRegion[] = [],
    threshold = 0.1,
  ): Promise<ComparisonResult> {
    const baseline = await this.loadImage(baselinePath);
    const actual = await this.loadImage(actualPath);

    const maskedBaseline = masks.length > 0 ? this.applyMasks(baseline, masks) : baseline;
    const maskedActual = masks.length > 0 ? this.applyMasks(actual, masks) : actual;

    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      // Create a visual diff showing size mismatch
      const maxWidth = Math.max(baseline.width, actual.width);
      const maxHeight = Math.max(baseline.height, actual.height);
      const diff = new PNG({ width: maxWidth, height: maxHeight });

      // Fill with error color
      for (let i = 0; i < diff.data.length; i += 4) {
        diff.data[i] = 255;
        diff.data[i + 1] = 0;
        diff.data[i + 2] = 0;
        diff.data[i + 3] = 255;
      }

      await this.saveImage(diff, outputPath);

      return {
        passed: false,
        baselinePath,
        actualPath,
        diffPath: outputPath,
        diffPixels: -1,
        diffPercentage: 100,
        appliedMasks: masks,
        dimensions: {
          width: actual.width,
          height: actual.height,
        },
      };
    }

    const diff = new PNG({ width: baseline.width, height: baseline.height });

    const diffPixels = pixelmatch(
      maskedBaseline.data,
      maskedActual.data,
      diff.data,
      baseline.width,
      baseline.height,
      {
        threshold,
        diffColor: [255, 0, 0],
        diffColorAlt: [0, 255, 0],
      },
    );

    await this.saveImage(diff, outputPath);

    const totalPixels = baseline.width * baseline.height;

    return {
      passed: diffPixels === 0,
      baselinePath,
      actualPath,
      diffPath: outputPath,
      diffPixels,
      diffPercentage: (diffPixels / totalPixels) * 100,
      appliedMasks: masks,
      dimensions: {
        width: baseline.width,
        height: baseline.height,
      },
    };
  }

  /**
   * Get image dimensions without loading full image
   */
  async getImageDimensions(
    imagePath: string,
  ): Promise<{ width: number; height: number }> {
    const image = await this.loadImage(imagePath);
    return { width: image.width, height: image.height };
  }

  /**
   * Convert image to base64 data URL
   */
  async toDataURL(imagePath: string): Promise<string> {
    const buffer = fs.readFileSync(imagePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}

export const imageProcessor = new ImageProcessor();
