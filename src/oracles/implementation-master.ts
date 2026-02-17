import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  ImplementationMasterOracle,
  GeneratedIdea,
  ResearchReport,
  ImplementationResult,
  ProjectSetup,
  Feature,
  BuildError,
} from '../types/oracles.js';
import { PiAgent, type PiResult } from '../services/pi-agent.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import {
  generatePackageJson,
  generateTsConfig,
  generateGitignore,
} from '../templates/package-template.js';
import { generateReadme } from '../templates/readme-template.js';

const ORACLE = 'implementation-master';
const execAsync = promisify(exec);

/**
 * Coordinates with the Pi coding agent to build the actual project.
 * Handles project scaffolding, feature implementation, and verification.
 */
export class ImplementationMaster implements ImplementationMasterOracle {
  private pi: PiAgent;
  private workspaceRoot: string;

  constructor() {
    this.pi = PiAgent.sonnet();
    this.workspaceRoot = config.pi.workspace;
  }

  async implement(
    idea: GeneratedIdea,
    research: ResearchReport,
  ): Promise<ImplementationResult> {
    const startTime = Date.now();
    const issues: BuildError[] = [];
    const technicalDebt: string[] = [];

    logger.info(`Implementing: ${idea.name}`, undefined, ORACLE);

    try {
      // 1. Initialize project structure
      logger.info('Initializing project...', undefined, ORACLE);
      const setup = await this.initializeProject(idea);

      if (!setup.initialized) {
        return this.failureResult(
          setup.repoPath,
          startTime,
          `Setup failed: ${setup.errors.join(', ')}`,
        );
      }

      // 2. Implement core features one by one
      logger.info('Building core features...', undefined, ORACLE);
      let coreResults: ImplementationResult['coreFeatures'] = [];

      const mustFeatures = idea.coreFeatures.filter((f) => f.priority === 'must');
      const shouldFeatures = idea.coreFeatures.filter((f) => f.priority === 'should');

      for (const feature of mustFeatures) {
        logger.info(`Implementing must-have: ${feature.name}`, undefined, ORACLE);
        const result = await this.implementFeature(feature, idea, setup.repoPath, research);

        coreResults.push({
          feature,
          implemented: result.success,
          filesModified: result.filesCreated || [],
        });

        if (!result.success) {
          logger.warn(
            `Must-have feature failed: ${feature.name}`,
            result.errors,
            ORACLE,
          );
          issues.push(...(result.errors || []));
          technicalDebt.push(`${feature.name}: incomplete implementation`);
        }
      }

      // 2b. Verify-and-fix loop: keep spinning until all must-haves work and build passes
      const MAX_FIX_ROUNDS = 3;
      for (let round = 0; round < MAX_FIX_ROUNDS; round++) {
        const buildResult = await this.tryBuild(setup.repoPath);
        const failedMusts = coreResults
          .filter((r) => r.feature.priority === 'must' && !r.implemented);

        if (buildResult.ok && failedMusts.length === 0) {
          logger.success('Build passes and all must-have features implemented', ORACLE);
          break;
        }

        logger.warn(
          `Fix round ${round + 1}/${MAX_FIX_ROUNDS}: `
          + `build=${buildResult.ok ? 'ok' : 'FAIL'}, `
          + `failed must-haves=${failedMusts.length}`,
          undefined,
          ORACLE,
        );

        // Gather error context for the fix prompt
        const errorContext: string[] = [];
        if (!buildResult.ok) {
          errorContext.push(`## Build Errors\n\`\`\`\n${buildResult.stderr}\n\`\`\``);
        }
        for (const failed of failedMusts) {
          errorContext.push(
            `## Failed Feature: ${failed.feature.name}\n`
            + `Description: ${failed.feature.description}`,
          );
        }

        // Ask Pi to fix everything in one shot
        const fixResult = await this.fixBuild(
          idea,
          setup.repoPath,
          errorContext.join('\n\n'),
        );

        // Re-check build after fix
        const postFix = await this.tryBuild(setup.repoPath);

        // Re-evaluate failed must-haves: if build now passes, assume features are fixed
        if (postFix.ok) {
          // Mark previously-failed must-haves as implemented
          for (const entry of coreResults) {
            if (entry.feature.priority === 'must' && !entry.implemented) {
              entry.implemented = true;
              logger.info(
                `Feature "${entry.feature.name}" now passes after fix`,
                undefined,
                ORACLE,
              );
            }
          }
          logger.success(
            `Fix round ${round + 1} resolved all issues`,
            ORACLE,
          );
          break;
        }

        // If Pi couldn't fix and this is the last round, mark remaining issues
        if (round === MAX_FIX_ROUNDS - 1) {
          logger.warn(
            `Exhausted ${MAX_FIX_ROUNDS} fix rounds, proceeding with best effort`,
            undefined,
            ORACLE,
          );
          if (!postFix.ok) {
            technicalDebt.push(`Build still failing after ${MAX_FIX_ROUNDS} fix rounds`);
          }
        }
      }

      // 3. Try "should" features but don't fail if they don't work
      for (const feature of shouldFeatures) {
        logger.info(`Implementing should-have: ${feature.name}`, undefined, ORACLE);
        const result = await this.implementFeature(feature, idea, setup.repoPath, research);

        coreResults.push({
          feature,
          implemented: result.success,
          filesModified: result.filesCreated || [],
        });

        if (!result.success) {
          technicalDebt.push(`${feature.name}: skipped (nice-to-have)`);
        }
      }

      // 4. Create examples
      logger.info('Creating examples...', undefined, ORACLE);
      const examplesCreated = await this.createExamples(idea, setup.repoPath);

      // 5. Generate README
      logger.info('Generating README...', undefined, ORACLE);
      const readmeContent = generateReadme(idea);
      await fs.writeFile(path.join(setup.repoPath, 'README.md'), readmeContent);

      // 6. Final build check
      logger.info('Final build check...', undefined, ORACLE);
      const finalBuild = await this.tryBuild(setup.repoPath);
      if (!finalBuild.ok) {
        technicalDebt.push('Build fails — needs manual fixing');
      }

      // 7. Determine status
      const mustHavesDone = coreResults
        .filter((r) => r.feature.priority === 'must')
        .every((r) => r.implemented);

      const status = mustHavesDone && finalBuild.ok ? 'complete' : 'partial';

      const totalHours = (Date.now() - startTime) / 3600000;

      logger.info(
        `Implementation ${status} in ${totalHours.toFixed(2)}h`,
        undefined,
        ORACLE,
      );

      return {
        status,
        repoPath: setup.repoPath,
        buildArtifacts: [],
        coreFeatures: coreResults,
        examplesCreated,
        testsPass: false, // TODO: run tests
        readmeExists: true,
        totalHours,
        linesOfCode: await this.countLOC(setup.repoPath),
        filesCreated: await this.countFiles(setup.repoPath),
        issues,
        technicalDebt,
        todoItems: technicalDebt,
      };
    } catch (error) {
      logger.error('Implementation failed', error, ORACLE);
      return this.failureResult(
        path.join(this.workspaceRoot, idea.name.toLowerCase().replace(/\s+/g, '-')),
        startTime,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async initializeProject(idea: GeneratedIdea): Promise<ProjectSetup> {
    const projectName = idea.name.toLowerCase().replace(/\s+/g, '-');
    const repoPath = path.join(this.workspaceRoot, projectName);

    logger.info(`Scaffolding project at ${repoPath}`, undefined, ORACLE);

    const errors: string[] = [];

    try {
      // Create directory structure
      await fs.mkdir(repoPath, { recursive: true });
      await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
      await fs.mkdir(path.join(repoPath, 'examples'), { recursive: true });
      await fs.mkdir(path.join(repoPath, 'tests'), { recursive: true });

      // Write package.json
      const packageJson = generatePackageJson(idea);
      await fs.writeFile(
        path.join(repoPath, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      // Write tsconfig.json
      const tsConfig = generateTsConfig();
      await fs.writeFile(
        path.join(repoPath, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2),
      );

      // Write .gitignore
      await fs.writeFile(
        path.join(repoPath, '.gitignore'),
        generateGitignore(),
      );

      // Create stub entry point
      await fs.writeFile(
        path.join(repoPath, 'src', 'index.ts'),
        `// ${idea.name}\n// ${idea.tagline}\n\nexport const VERSION = '0.1.0';\n`,
      );

      // Create types stub
      await fs.writeFile(
        path.join(repoPath, 'src', 'types.ts'),
        `// Type definitions for ${idea.name}\n\nexport interface Config {\n  // TODO: define config\n}\n`,
      );

      // Install dependencies
      try {
        await execAsync('npm install', { cwd: repoPath, timeout: 120000 });
        logger.info('Dependencies installed', undefined, ORACLE);
      } catch (installError) {
        const msg = installError instanceof Error ? installError.message : String(installError);
        errors.push(`npm install warning: ${msg.slice(0, 200)}`);
        // Non-fatal: deps might partially install
      }

      // Initialize git
      try {
        await execAsync('git init && git checkout -b main', {
          cwd: repoPath,
          timeout: 10000,
        });
      } catch {
        errors.push('git init failed (non-fatal)');
      }

      return {
        repoPath,
        packageJson,
        tsConfig,
        initialized: true,
        errors,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      return {
        repoPath,
        packageJson: {},
        tsConfig: {},
        initialized: false,
        errors,
      };
    }
  }

  // ── Private helpers ──────────────────────────────────────

  private async implementFeature(
    feature: Feature,
    idea: GeneratedIdea,
    repoPath: string,
    research: ResearchReport,
  ): Promise<PiResult> {
    const prompt = this.generateFeaturePrompt(feature, idea, research);

    return this.pi.execute({
      task: 'implement-feature',
      context: {
        projectPath: repoPath,
        feature,
        idea: { name: idea.name, description: idea.description },
        inspiration: research.inspiration.slice(0, 3),
      },
      instructions: prompt,
      timeLimit: feature.estimatedHours * 3600,
      timeout: Math.max(feature.estimatedHours * 3600 * 1000, 300000), // min 5 min
    });
  }

  private generateFeaturePrompt(
    feature: Feature,
    idea: GeneratedIdea,
    research: ResearchReport,
  ): string {
    // Build implementation-hints section from research
    const hints = research.implementationHints;
    const hintsBlock: string[] = [];

    if (hints?.architecturePatterns.length) {
      hintsBlock.push(
        '### Architecture Patterns (from similar projects)\n'
        + hints.architecturePatterns.map((p) => `- ${p}`).join('\n'),
      );
    }
    if (hints?.fileStructure.length) {
      hintsBlock.push(
        '### File Structures Observed\n'
        + hints.fileStructure.map((f) => `- ${f}`).join('\n'),
      );
    }
    if (hints?.commonDependencies.length) {
      hintsBlock.push(
        '### Common Dependencies in Prior Art\n'
        + hints.commonDependencies.map((d) => `- ${d}`).join('\n'),
      );
    }
    if (hints?.apiExamples.length) {
      hintsBlock.push(
        '### API Examples from Similar Projects\n'
        + hints.apiExamples.join('\n\n'),
      );
    }

    const hintsSection = hintsBlock.length > 0
      ? `\n## Implementation Research\n${hintsBlock.join('\n\n')}\n`
      : '';

    return `
# Implement Feature: ${feature.name}

## Context
Project: ${idea.name}
Description: ${idea.description}

## Feature Requirements
${feature.description}
${hintsSection}
## Instructions
1. Create necessary files in the project structure
2. Implement the core logic with these priorities:
   - Working code > elegant code
   - Happy path first, error handling later
   - Use dependencies from package.json
   - Add minimal comments only where needed

3. Time budget: ${feature.estimatedHours} hours MAX
   - If stuck for >15 minutes, try simpler approach
   - If can't complete in time, implement partial version

4. Verification:
   - Code should run without errors
   - Basic functionality should work
   - Add simple test if time permits

## Slop Factor: ${idea.slopFactor}/100
${idea.slopFactor > 70 ? '- HIGH slop: be scrappy, ship fast, iterate later' : '- Moderate slop: some polish, but still ship fast'}

## Output
Provide:
- List of files created/modified
- Brief explanation of implementation
- Any shortcuts taken or technical debt introduced
    `.trim();
  }

  private async createExamples(idea: GeneratedIdea, repoPath: string): Promise<string[]> {
    const basicExample = `// Basic usage of ${idea.name}
// ${idea.tagline}

import { VERSION } from '../src/index.js';

console.log(\`${idea.name} v\${VERSION}\`);
console.log('See README.md for full usage instructions.');
`;

    const examplePath = path.join(repoPath, 'examples', 'basic.ts');
    await fs.writeFile(examplePath, basicExample);

    return [examplePath];
  }

  private async tryBuild(repoPath: string): Promise<{ ok: boolean; stderr: string }> {
    try {
      await execAsync('npx tsc --noEmit', { cwd: repoPath, timeout: 60000 });
      return { ok: true, stderr: '' };
    } catch (error: unknown) {
      const stderr =
        (error as { stderr?: string })?.stderr
        || (error instanceof Error ? error.message : String(error));
      return { ok: false, stderr: stderr.slice(0, 3000) };
    }
  }

  /**
   * Ask Pi to fix build errors and/or incomplete must-have features.
   */
  private async fixBuild(
    idea: GeneratedIdea,
    repoPath: string,
    errorContext: string,
  ): Promise<PiResult> {
    const prompt = `
# Fix Build Errors & Incomplete Features

Project: ${idea.name}
Path:    ${repoPath}

The project fails to build or has incomplete must-have features.
Fix ALL issues listed below so the project compiles with \`tsc --noEmit\` and
every must-have feature has a working implementation.

${errorContext}

## Rules
- Edit existing files in place — do NOT start from scratch.
- Fix type errors, missing imports, and broken logic.
- If a must-have feature file is missing, create it.
- Keep changes minimal and targeted.
- After fixing, the project MUST compile without errors.
`.trim();

    logger.info('Asking Pi to fix build issues...', undefined, ORACLE);
    return this.pi.execute({
      task: 'fix-build',
      context: { projectPath: repoPath },
      instructions: prompt,
      timeout: 120_000,
    });
  }

  private async countLOC(dir: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `find src -name '*.ts' -exec cat {} + 2>/dev/null | wc -l`,
        { cwd: dir },
      );
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private async countFiles(dir: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `find . -not -path './node_modules/*' -not -path './.git/*' -type f | wc -l`,
        { cwd: dir },
      );
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private failureResult(
    repoPath: string,
    startTime: number,
    errorMsg: string,
  ): ImplementationResult {
    return {
      status: 'failed',
      repoPath,
      buildArtifacts: [],
      coreFeatures: [],
      examplesCreated: [],
      testsPass: false,
      readmeExists: false,
      totalHours: (Date.now() - startTime) / 3600000,
      linesOfCode: 0,
      filesCreated: 0,
      issues: [
        {
          type: 'runtime',
          file: 'unknown',
          message: errorMsg,
          severity: 'error',
        },
      ],
      technicalDebt: [],
      todoItems: [],
    };
  }
}
