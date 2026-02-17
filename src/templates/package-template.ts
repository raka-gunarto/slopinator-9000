import type { GeneratedIdea } from '../types/oracles.js';

/**
 * Generate a package.json object for a new project.
 */
export function generatePackageJson(idea: GeneratedIdea): Record<string, unknown> {
  const pkgName = idea.name.toLowerCase().replace(/\s+/g, '-');

  return {
    name: pkgName,
    version: '0.1.0',
    description: idea.tagline,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    type: 'module',
    scripts: {
      build: 'tsup src/index.ts --dts --format esm,cjs',
      dev: 'tsup src/index.ts --watch',
      test: 'vitest run',
    },
    keywords: ['slopinator-9000', 'velocity-coding', 'ai-generated', 'typescript'],
    author: 'Slopinator-9000',
    license: 'MIT',
    dependencies: Object.fromEntries(
      idea.dependencies.map((dep) => [dep, 'latest']),
    ),
    devDependencies: {
      typescript: '^5.0.0',
      tsup: '^8.0.0',
      vitest: '^1.0.0',
      '@types/node': '^20.0.0',
    },
  };
}

/**
 * Generate a tsconfig.json for a new project.
 */
export function generateTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
    },
    include: ['src'],
    exclude: ['node_modules', 'dist'],
  };
}

/**
 * Generate the standard MIT license text.
 */
export function generateMITLicense(): string {
  const year = new Date().getFullYear();
  return `MIT License

Copyright (c) ${year} Slopinator-9000

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

/**
 * Generate a .gitignore for a Node/TS project.
 */
export function generateGitignore(): string {
  return `node_modules/
dist/
.env
*.log
.DS_Store
coverage/
`;
}

/**
 * Generate a simple GitHub Actions CI workflow.
 */
export function generateCIWorkflow(): string {
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
`;
}

/**
 * Generate a CHANGELOG for initial release.
 */
export function generateChangelog(): string {
  const date = new Date().toISOString().split('T')[0];
  return `# Changelog

## v0.1.0 (${date})

- Initial release 🚀
- Core features implemented
- Examples added
`;
}
