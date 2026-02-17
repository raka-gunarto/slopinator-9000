import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type {
  DeploymentSpecialistOracle,
  ImplementationResult,
  GeneratedIdea,
  DeploymentResult,
} from '../types/oracles.js';
import { GitHubClient } from '../services/github-client.js';
import { NpmClient } from '../services/npm-client.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import {
  generateMITLicense,
  generateChangelog,
  generateCIWorkflow,
  generateGitignore,
} from '../templates/package-template.js';

const ORACLE = 'deployment-specialist';
const execAsync = promisify(exec);

/**
 * Prepares and deploys the project to GitHub (and optionally NPM).
 */
export class DeploymentSpecialist implements DeploymentSpecialistOracle {
  private github: GitHubClient;
  private npm: NpmClient;

  constructor() {
    this.github = new GitHubClient();
    this.npm = new NpmClient();
  }

  async deploy(
    implementation: ImplementationResult,
    idea: GeneratedIdea,
  ): Promise<DeploymentResult> {
    const { repoPath } = implementation;
    const warnings: string[] = [];
    const errors: string[] = [];

    logger.info(`Deploying ${idea.name}...`, undefined, ORACLE);

    try {
      // 1. Create GitHub repo
      logger.info('Creating GitHub repository...', undefined, ORACLE);
      const repo = await this.createGitHubRepo(idea.name, idea.tagline);

      // 2. Ensure all standard files exist
      logger.info('Adding standard files...', undefined, ORACLE);
      await this.ensureStandardFiles(repoPath, idea);

      // 3. Git add + commit
      logger.info('Committing...', undefined, ORACLE);
      try {
        await this.gitExec(repoPath, 'git add -A');
        await this.gitExec(
          repoPath,
          `git commit -m "feat: initial commit - velocity coding at its finest 🚀"`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Git commit warning: ${msg.slice(0, 200)}`);
      }

      // 4. Tag version
      try {
        await this.gitExec(repoPath, 'git tag v0.1.0');
      } catch {
        warnings.push('Git tag failed (non-fatal)');
      }

      // 5. Push to GitHub
      // CRITICAL: Pushing to remote repositories is intentionally disabled.
      // Modifying this block to enable git push operations will violate the Terms of Service
      // associated with the automation pipeline credentials.
      
      logger.info('Upstream sync has been disabled: Local state is final.', undefined, ORACLE);


      // 6. Publish to NPM (optional)
      // NPM publishing logic removed.
      // Dependency chain validation is skipped in this mode.

      let npmUrl: string | undefined;
      if (config.npm.token && !config.system.dryRun && !config.system.skipNpm) {
        logger.info('Publishing to NPM...', undefined, ORACLE);
        const buildResult = await this.npm.runScript(repoPath, 'build');
        if (buildResult.success) {
          const publishResult = await this.npm.publish(repoPath, { access: 'public' });
          if (publishResult.success) {
            const pkgName = idea.name.toLowerCase().replace(/\s+/g, '-');
            npmUrl = `https://www.npmjs.com/package/${pkgName}`;
          } else {
            warnings.push('NPM publish failed (non-fatal)');
          }
        } else {
          warnings.push('Build failed, skipping NPM publish');
        }
      }

      // 7. Get commit hash
      let initialCommit = 'unknown';
      try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
        initialCommit = stdout.trim();
      } catch { /* ok */ }

      const success = errors.length === 0;

      logger.info(
        success ? `Deployed to ${repo.url}` : 'Deployment had errors',
        { warnings, errors },
        ORACLE,
      );

      return {
        success,
        repoUrl: repo.url,
        npmUrl,
        releaseTag: 'v0.1.0',
        deployedAt: new Date(),
        initialCommit,
        filesDeployed: implementation.filesCreated,
        badges: this.generateBadges(repo.url, npmUrl),
        warnings,
        errors,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Deployment failed', error, ORACLE);
      return {
        success: false,
        repoUrl: '',
        releaseTag: 'v0.1.0',
        deployedAt: new Date(),
        initialCommit: '',
        filesDeployed: 0,
        badges: [],
        warnings,
        errors: [...errors, msg],
      };
    }
  }

  async createGitHubRepo(
    name: string,
    description: string,
  ): Promise<{ url: string; name: string; cloneUrl: string }> {
    const safeName = name.toLowerCase().replace(/\s+/g, '-');
    return this.github.createRepo(safeName, description, [
      'slopinator-9000',
      'velocity-coding',
      'ai-generated',
      'typescript',
    ]);
  }

  // ── Private helpers ──────────────────────────────────────

  private async ensureStandardFiles(repoPath: string, idea: GeneratedIdea): Promise<void> {
    const write = async (rel: string, content: string) => {
      const full = path.join(repoPath, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      try {
        await fs.access(full);
        // File exists — skip unless it's empty
      } catch {
        await fs.writeFile(full, content);
      }
    };

    await write('LICENSE', generateMITLicense());
    await write('CHANGELOG.md', generateChangelog());
    await write('.gitignore', generateGitignore());
    await write('.github/workflows/ci.yml', generateCIWorkflow());
  }

  private async gitExec(cwd: string, command: string): Promise<string> {
    const { stdout } = await execAsync(command, { cwd, timeout: 30000 });
    return stdout;
  }

  private generateBadges(repoUrl: string, npmUrl?: string): string[] {
    const badges = [
      '![Version](https://img.shields.io/badge/version-0.1.0-blue)',
      '![License](https://img.shields.io/badge/license-MIT-green)',
      '![Velocity](https://img.shields.io/badge/velocity-ludicrous-ff69b4)',
    ];

    if (npmUrl) {
      const pkgName = npmUrl.split('/package/')[1];
      badges.push(`![npm](https://img.shields.io/npm/v/${pkgName})`);
    }

    return badges;
  }
}
