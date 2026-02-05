# Contributing to StageMask

Thank you for your interest in contributing to StageMask! This guide will help you get started.

## Code of Conduct

Please be respectful and considerate in all interactions. We're all here to build something useful together.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Setup

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/Crypted39/stagemask.git
   cd stagemask
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests to make sure everything works:
   ```bash
   npx playwright test
   ```

## Development Workflow

### Project Structure

```
stagemask/
├── src/
│   ├── cli/           # CLI commands (review, init, list, etc.)
│   ├── core/          # Core logic (config manager, image processor, types)
│   ├── plugin/        # Playwright fixture (visualSnapshot, softVisualSnapshot)
│   ├── server/        # Express server for the review UI
│   └── ui/            # React UI components
├── test/              # Test files and test page
├── dist/              # Built output (generated)
└── assets/            # Images for README
```

### Development Commands

```bash
# Build everything (CLI + UI)
npm run build

# Watch mode for CLI/server changes
npm run dev

# Build only the UI
npm run build:ui

# Run Playwright tests
npx playwright test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Making Changes

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Test your changes:
   ```bash
   npm run build
   npx playwright test
   ```

4. Test the CLI manually:
   ```bash
   npx stagemask review
   npx stagemask --help
   ```

5. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add support for XYZ"
   ```

## Pull Request Process

1. Update the README.md if you've added new features or changed behavior

2. Make sure all tests pass

3. Push your branch and open a Pull Request

4. Describe your changes in the PR description:
   - What does this PR do?
   - Why is this change needed?
   - How was it tested?

5. Wait for review - we'll try to respond within a few days

## Commit Message Guidelines

We follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add threshold slider to UI
fix: handle missing metadata file gracefully
docs: update CLI examples in README
```

## Reporting Bugs

When reporting bugs, please include:

1. **Steps to reproduce** - What did you do?
2. **Expected behavior** - What should have happened?
3. **Actual behavior** - What actually happened?
4. **Environment** - OS, Node.js version, Playwright version
5. **Screenshots/logs** - If applicable

## Suggesting Features

Feature suggestions are welcome! Please open an issue with:

1. **Use case** - What problem are you trying to solve?
2. **Proposed solution** - How do you think it should work?
3. **Alternatives** - Have you considered other approaches?


## Questions?

If you have questions, feel free to:
- Open an issue with the "question" label
- Start a discussion in GitHub Discussions

## License

By contributing to StageMask, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎭