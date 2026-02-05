import express, { Request, Response } from 'express';
import { createServer as createHttpServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { ConfigManager } from '../core/config-manager';
import { ImageProcessor } from '../core/image-processor';
import { FailedScreenshot, MaskRegion, DEFAULT_PORT, WSMessage } from '../core/types';

/**
 * Safely extract a string from Express 5 query/param values (can be string | string[])
 */
function getString(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return '';
}

export interface ServerOptions {
  port?: number;
  projectRoot?: string;
  testResultsDir?: string;
}

export class ReviewServer {
  private app: express.Application;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private config: ConfigManager;
  private imageProcessor: ImageProcessor;
  private options: Required<ServerOptions>;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port || DEFAULT_PORT,
      projectRoot: options.projectRoot || process.cwd(),
      testResultsDir: options.testResultsDir || '',
    };

    this.app = express();
    this.config = new ConfigManager(this.options.projectRoot);
    this.imageProcessor = new ImageProcessor();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    // CLI runs from dist/cli/, UI is at dist/ui/
    this.app.use(express.static(path.join(__dirname, '../ui')));

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Get all failed screenshots
    this.app.get('/api/failed-screenshots', async (req: Request, res: Response) => {
      try {
        const screenshots = await this.findFailedScreenshots();
        res.json(screenshots);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get specific screenshot details
    this.app.get('/api/screenshot/:name', async (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const config = this.config.getScreenshotConfig(name);
        res.json(config || { name, masks: [] });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get masks for a screenshot
    this.app.get('/api/masks/:name', (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const masks = this.config.getMasks(decodeURIComponent(name));
        res.json(masks);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Save masks for a screenshot
    this.app.post('/api/masks/:name', (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const { masks } = req.body as { masks: MaskRegion[] };
        this.config.setMasks(decodeURIComponent(name), masks);
        this.config.save();
        this.broadcast({ type: 'masks-updated', payload: { name, masks } });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Add a single mask
    this.app.post('/api/masks/:name/add', (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const maskData = req.body as Omit<MaskRegion, 'id' | 'createdAt'>;
        const mask = this.config.addMask(decodeURIComponent(name), maskData);
        this.config.save();
        this.broadcast({
          type: 'masks-updated',
          payload: { name, masks: this.config.getMasks(name) },
        });
        res.json(mask);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Delete a mask
    this.app.delete('/api/masks/:name/:maskId', (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const maskId = getString(req.params.maskId);
        const success = this.config.removeMask(decodeURIComponent(name), maskId);
        if (success) {
          this.config.save();
          this.broadcast({
            type: 'masks-updated',
            payload: { name, masks: this.config.getMasks(name) },
          });
        }
        res.json({ success });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Serve image files (restricted to test-results and snapshot directories)
    this.app.get('/api/image', async (req: Request, res: Response) => {
      try {
        const imagePath = getString(req.query.path as string | string[] | undefined);
        if (!imagePath) {
          res.status(400).json({ error: 'Path parameter required' });
          return;
        }

        // Validate the path is within allowed directories
        const resolvedPath = path.resolve(imagePath);
        if (!this.isPathAllowed(resolvedPath)) {
          res
            .status(403)
            .json({ error: 'Access denied: path outside allowed directories' });
          return;
        }

        if (!fs.existsSync(resolvedPath)) {
          res.status(404).json({ error: 'Image not found' });
          return;
        }
        res.sendFile(resolvedPath);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get image as base64
    this.app.get('/api/image-data', async (req: Request, res: Response) => {
      try {
        const imagePath = getString(req.query.path as string | string[] | undefined);
        if (!imagePath) {
          res.status(400).json({ error: 'Path parameter required' });
          return;
        }

        // Validate the path is within allowed directories
        const resolvedPath = path.resolve(imagePath);
        if (!this.isPathAllowed(resolvedPath)) {
          res
            .status(403)
            .json({ error: 'Access denied: path outside allowed directories' });
          return;
        }

        if (!fs.existsSync(resolvedPath)) {
          res.status(404).json({ error: 'Image not found' });
          return;
        }
        const dataUrl = await this.imageProcessor.toDataURL(resolvedPath);
        res.json({ dataUrl });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Generate comparison with current masks
    this.app.post('/api/compare/:name', async (req: Request, res: Response) => {
      try {
        const name = getString(req.params.name);
        const { baselinePath, actualPath } = req.body;

        // Validate paths are within allowed directories
        const resolvedBaseline = path.resolve(baselinePath);
        const resolvedActual = path.resolve(actualPath);

        if (
          !this.isPathAllowed(resolvedBaseline) ||
          !this.isPathAllowed(resolvedActual)
        ) {
          res
            .status(403)
            .json({ error: 'Access denied: path outside allowed directories' });
          return;
        }

        const masks = this.config.getMasks(decodeURIComponent(name));
        const threshold = this.config.getEffectiveThreshold(name);

        const result = await this.imageProcessor.compare(
          resolvedBaseline,
          resolvedActual,
          masks,
          threshold,
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get full config
    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.config.getConfig());
    });

    // Update global threshold
    this.app.post('/api/config/threshold', (req: Request, res: Response) => {
      try {
        const { threshold } = req.body;
        this.config.setGlobalThreshold(threshold);
        this.config.save();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Fallback to index.html for SPA routing (Express 5 requires named wildcard)
    this.app.get('/{*splat}', (req: Request, res: Response) => {
      const indexPath = path.join(__dirname, '../ui/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // Development fallback - serve a simple HTML
        res.send(this.getDevHtml());
      }
    });
  }

  /**
   * Check if a file path is within allowed directories (security measure)
   * Only allows access to files within the project root
   */
  private isPathAllowed(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const projectRoot = path.resolve(this.options.projectRoot);

    // Check if the path is within the project root
    return (
      resolvedPath.startsWith(projectRoot + path.sep) || resolvedPath === projectRoot
    );
  }

  private async findFailedScreenshots(): Promise<FailedScreenshot[]> {
    const results: FailedScreenshot[] = [];

    // Look for test-results directory (custom or default)
    const testResultsDir = this.options.testResultsDir
      ? path.resolve(this.options.projectRoot, this.options.testResultsDir)
      : path.join(this.options.projectRoot, 'test-results');

    if (!fs.existsSync(testResultsDir)) {
      return results;
    }

    // Find all actual vs expected pairs
    const actualImages = await glob('**/*-actual.png', {
      cwd: testResultsDir,
      absolute: true,
    });

    for (const actualPath of actualImages) {
      const baseName = path.basename(actualPath, '-actual.png');
      const dir = path.dirname(actualPath);

      const expectedPath = path.join(dir, `${baseName}-expected.png`);
      const diffPath = path.join(dir, `${baseName}-diff.png`);
      const metadataPath = path.join(dir, `${baseName}-metadata.json`);

      if (fs.existsSync(expectedPath)) {
        // Try to read metadata file for accurate test info
        let testFile = 'unknown';
        let describeName = 'Unknown Suite';
        let testName = 'Unknown Test';

        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            testFile = metadata.testFile || testFile;
            describeName = metadata.describeName || describeName;
            testName = metadata.testName || testName;
          } catch (e) {
            console.warn(`Failed to read metadata from ${metadataPath}:`, e);
          }
        } else {
          // Fallback: try to parse from folder name (less accurate)
          const relativePath = path.relative(testResultsDir, dir);
          const folderName = relativePath.split(path.sep)[0] || '';
          const parsed = this.parsePlaywrightFolderName(folderName);
          testFile = parsed.testFile;
          describeName = parsed.describeName;
          testName = parsed.testName;
        }

        results.push({
          testFile,
          describeName,
          testName,
          screenshotName: `${baseName}.png`,
          baselinePath: expectedPath,
          actualPath,
          diffPath: fs.existsSync(diffPath) ? diffPath : '',
          failedAt: fs.statSync(actualPath).mtime.toISOString(),
          comparison: {
            passed: false,
            baselinePath: expectedPath,
            actualPath,
            diffPath: fs.existsSync(diffPath) ? diffPath : undefined,
            diffPixels: -1,
            diffPercentage: -1,
            appliedMasks: [],
            dimensions: { width: 0, height: 0 },
          },
        });
      }
    }

    // Sort by describe name, then test name, then screenshot name
    results.sort((a, b) => {
      if (a.describeName !== b.describeName) {
        return a.describeName.localeCompare(b.describeName);
      }
      if (a.testName !== b.testName) {
        return a.testName.localeCompare(b.testName);
      }
      return a.screenshotName.localeCompare(b.screenshotName);
    });

    return results;
  }

  /**
   * Parse Playwright's folder name to extract test info
   * Format is typically: {testFile}-{describeName}-{testName}-{browser}
   * But names get truncated and hashes added
   */
  private parsePlaywrightFolderName(folderName: string): {
    testFile: string;
    describeName: string;
    testName: string;
  } {
    // Common browser suffixes
    const browsers = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];
    let name = folderName;

    // Remove browser suffix
    for (const browser of browsers) {
      if (name.endsWith(`-${browser}`)) {
        name = name.slice(0, -(browser.length + 1));
        break;
      }
    }

    // Split by dashes
    const parts = name.split('-');

    if (parts.length < 2) {
      return {
        testFile: folderName,
        describeName: 'Unknown',
        testName: 'Unknown',
      };
    }

    // First part is usually the test file (without extension)
    const testFile = parts[0];

    // Try to find common patterns in the remaining parts
    // Look for hash patterns (5-6 alphanumeric chars) that Playwright adds
    const hashPattern = /^[a-f0-9]{5,6}$/i;

    // Filter out hash parts and reconstruct names
    const meaningfulParts = parts.slice(1).filter((p) => !hashPattern.test(p));

    if (meaningfulParts.length === 0) {
      return {
        testFile,
        describeName: 'Tests',
        testName: parts.slice(1).join(' '),
      };
    }

    // Try to identify where describe ends and test begins
    // Common patterns: "should", "can", "will", "does", "is", "has", "displays", "shows"
    const testStartWords = [
      'should',
      'can',
      'will',
      'does',
      'is',
      'has',
      'displays',
      'shows',
      'renders',
      'loads',
      'handles',
      'match',
    ];

    let describeEndIndex = -1;
    for (let i = 0; i < meaningfulParts.length; i++) {
      const part = meaningfulParts[i].toLowerCase();
      if (testStartWords.some((word) => part.startsWith(word))) {
        describeEndIndex = i;
        break;
      }
    }

    if (describeEndIndex > 0) {
      return {
        testFile,
        describeName: meaningfulParts.slice(0, describeEndIndex).join(' '),
        testName: meaningfulParts.slice(describeEndIndex).join(' '),
      };
    }

    // If we can't determine the split, use first half as describe, second as test
    const midpoint = Math.ceil(meaningfulParts.length / 2);
    return {
      testFile,
      describeName: meaningfulParts.slice(0, midpoint).join(' ') || 'Tests',
      testName: meaningfulParts.slice(midpoint).join(' ') || meaningfulParts.join(' '),
    };
  }

  private broadcast(message: WSMessage): void {
    if (!this.wss) return;
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private getDevHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright Visual Mask - Review</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    h1 { margin-bottom: 2rem; color: #fff; }
    .info {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 2rem;
    }
    code {
      background: #252540;
      padding: 0.2em 0.5em;
      border-radius: 4px;
      font-size: 0.9em;
    }
    a { color: #6c5ce7; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 Playwright Visual Mask</h1>
    <div class="info">
      <p>The UI is not built yet. Run <code>npm run build:ui</code> first.</p>
      <p style="margin-top: 1rem;">
        API endpoints available:
      </p>
      <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
        <li><code>GET /api/failed-screenshots</code></li>
        <li><code>GET /api/masks/:name</code></li>
        <li><code>POST /api/masks/:name</code></li>
        <li><code>GET /api/config</code></li>
      </ul>
    </div>
  </div>
</body>
</html>
    `;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createHttpServer(this.app);

      // Setup WebSocket
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (ws) => {
        console.log('Client connected');

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as WSMessage;
            this.handleWsMessage(ws, message);
          } catch (e) {
            console.error('Invalid WebSocket message:', e);
          }
        });

        ws.on('close', () => {
          console.log('Client disconnected');
        });
      });

      // Listen only on localhost for security (not exposed to network)
      this.server.listen(this.options.port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  private handleWsMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'test-rerun-requested':
        // Could trigger a test rerun here
        console.log('Test rerun requested:', message.payload);
        break;
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss?.close();
      this.server?.close(() => resolve());
    });
  }

  getPort(): number {
    return this.options.port;
  }
}

export function createServer(options?: ServerOptions): ReviewServer {
  return new ReviewServer(options);
}
