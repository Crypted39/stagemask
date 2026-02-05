import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import * as path from "path";
import * as fs from "fs";
import { createServer } from "../server";
import { ConfigManager } from "../core/config-manager";
import { DEFAULT_PORT, CONFIG_FILENAME } from "../core/types";

const program = new Command();

// Package info
const packageJson = {
  name: "stagemask",
  version: "0.1.0",
  description:
    "Visual regression testing tool with interactive mask editing for Playwright",
};

program
  .name("stagemask")
  .description(packageJson.description)
  .version(packageJson.version);

// Review command - launch the web UI
program
  .command("review")
  .alias("r")
  .description("Launch the visual review UI to manage screenshot masks")
  .option(
    "-p, --port <number>",
    "Port to run the server on (overrides saved port)",
  )
  .option("--no-open", "Do not automatically open the browser")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .option(
    "-r, --results-dir <path>",
    "Custom test results directory (default: test-results)",
  )
  .action(async (options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);

    // Use port from: CLI option > saved config > default
    const savedPort = config.getPort();
    const port = options.port
      ? parseInt(options.port, 10)
      : (savedPort ?? DEFAULT_PORT);

    // Determine test results directory
    const testResultsDir = options.resultsDir
      ? path.resolve(projectRoot, options.resultsDir)
      : path.join(projectRoot, "test-results");

    console.log(chalk.cyan("\n🎭 StageMask\n"));

    // Check if we're in a valid project
    const hasPlaywrightConfig =
      fs.existsSync(path.join(projectRoot, "playwright.config.ts")) ||
      fs.existsSync(path.join(projectRoot, "playwright.config.js"));

    if (!hasPlaywrightConfig) {
      console.log(
        chalk.yellow(
          "⚠️  No playwright.config found. Make sure you're in the right directory.\n",
        ),
      );
    }

    // Check for test results
    if (!fs.existsSync(testResultsDir)) {
      console.log(
        chalk.yellow(
          `⚠️  No test results directory found at: ${testResultsDir}\n`,
        ),
      );
      console.log(chalk.gray("   Run your tests first: npx playwright test\n"));
    } else if (options.resultsDir) {
      console.log(
        chalk.gray(`Using custom results directory: ${testResultsDir}\n`),
      );
    }

    const server = createServer({
      port,
      projectRoot,
      testResultsDir: options.resultsDir,
    });

    try {
      await server.start();

      const url = `http://localhost:${port}`;

      console.log(chalk.green("✓ Server started"));
      console.log(chalk.gray(`  ${url}\n`));

      if (options.open !== false) {
        console.log(chalk.gray("Opening browser..."));
        await open(url);
      }

      console.log(chalk.gray("Press Ctrl+C to stop\n"));

      // Keep running
      process.on("SIGINT", async () => {
        console.log(chalk.gray("\nShutting down..."));
        await server.stop();
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red("Failed to start server:"), error);
      process.exit(1);
    }
  });

// Port command - set custom port
program
  .command("port [number]")
  .description("Set or view the custom port for the review server")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .option("--reset", "Reset to default port")
  .action((portNumber, options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);

    // Reset port
    if (options.reset) {
      config.clearPort();
      config.save();
      console.log(chalk.green(`✓ Port reset to default (${DEFAULT_PORT})`));
      return;
    }

    // View current port
    if (!portNumber) {
      const currentPort = config.getPort();
      if (currentPort) {
        console.log(chalk.cyan(`Current port: ${currentPort}`));
      } else {
        console.log(
          chalk.gray(`No custom port set. Using default: ${DEFAULT_PORT}`),
        );
      }
      return;
    }

    // Set new port
    const port = parseInt(portNumber, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(
        chalk.red("Invalid port number. Must be between 1 and 65535."),
      );
      process.exit(1);
    }

    config.setPort(port);
    config.save();
    console.log(chalk.green(`✓ Port set to ${port}`));
    console.log(
      chalk.gray(`  This will be used when running \`npx stagemask review\`\n`),
    );
  });

// Init command - create config file
program
  .command("init")
  .description("Initialize configuration file")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .option("-f, --force", "Overwrite existing config")
  .action((options) => {
    const projectRoot = path.resolve(options.dir);
    const configPath = path.join(projectRoot, CONFIG_FILENAME);

    console.log(chalk.cyan("\n🎭 StageMask - Init\n"));

    if (fs.existsSync(configPath) && !options.force) {
      console.log(chalk.yellow(`Config file already exists: ${configPath}`));
      console.log(chalk.gray("Use --force to overwrite\n"));
      return;
    }

    const config = new ConfigManager(projectRoot);
    config.save();

    console.log(chalk.green(`✓ Created ${CONFIG_FILENAME}`));
    console.log(chalk.gray(`  ${configPath}\n`));

    console.log(chalk.white("Next steps:"));
    console.log(
      chalk.gray("1. Run your Playwright tests to generate screenshots"),
    );
    console.log(
      chalk.gray("2. Run `npx stagemask review` to open the mask editor\n"),
    );
  });

// List command - show configured masks
program
  .command("list")
  .alias("ls")
  .description("List all configured screenshot masks")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .action((options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);
    const fullConfig = config.getConfig();

    console.log(chalk.cyan("\n🎭 Configured Masks\n"));

    const screenshots = Object.entries(fullConfig.screenshots);

    if (screenshots.length === 0) {
      console.log(chalk.gray("No masks configured yet."));
      console.log(chalk.gray("Run `npx stagemask review` to add masks.\n"));
      return;
    }

    for (const [name, screenshot] of screenshots) {
      console.log(chalk.white(`📸 ${name}`));

      if (screenshot.masks.length === 0) {
        console.log(chalk.gray("   No masks"));
      } else {
        for (const mask of screenshot.masks) {
          const coords = mask.isPercentage
            ? `${mask.x}%, ${mask.y}% → ${mask.width}% × ${mask.height}%`
            : `${mask.x}, ${mask.y} → ${mask.width} × ${mask.height}px`;

          console.log(chalk.gray(`   ├─ ${coords}`));
          if (mask.reason) {
            console.log(chalk.gray(`   │  ${chalk.italic(mask.reason)}`));
          }
        }
      }

      if (screenshot.threshold !== undefined) {
        console.log(chalk.gray(`   └─ threshold: ${screenshot.threshold}`));
      }

      console.log("");
    }
  });

// Clear command - remove all masks for a screenshot
program
  .command("clear <screenshot>")
  .description("Clear all masks for a screenshot")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .action((screenshot, options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);

    const existing = config.getMasks(screenshot);

    if (existing.length === 0) {
      console.log(chalk.yellow(`No masks found for "${screenshot}"`));
      return;
    }

    config.setMasks(screenshot, []);
    config.save();

    console.log(
      chalk.green(`✓ Cleared ${existing.length} mask(s) from "${screenshot}"`),
    );
  });

// Export command - export config for sharing
program
  .command("export")
  .description("Export mask configuration")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .option("-o, --output <path>", "Output file path")
  .option("-s, --screenshots <names...>", "Specific screenshots to export")
  .action((options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);

    let exported;
    if (options.screenshots) {
      exported = config.exportForScreenshots(options.screenshots);
    } else {
      exported = config.getConfig();
    }

    const output = JSON.stringify(exported, null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, output);
      console.log(chalk.green(`✓ Exported to ${options.output}`));
    } else {
      console.log(output);
    }
  });

// Import command - import config
program
  .command("import <file>")
  .description("Import mask configuration from file")
  .option("-d, --dir <path>", "Project directory", process.cwd())
  .option("--merge", "Merge with existing config instead of replacing")
  .action((file, options) => {
    const projectRoot = path.resolve(options.dir);
    const config = new ConfigManager(projectRoot);

    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    const imported = JSON.parse(fs.readFileSync(file, "utf-8"));

    if (options.merge) {
      config.importMasks(imported);
    } else {
      // Replace screenshots
      const current = config.getConfig();
      current.screenshots = imported.screenshots || {};
      config.save();
    }

    config.save();
    console.log(chalk.green(`✓ Imported configuration from ${file}`));
  });

program.parse();
