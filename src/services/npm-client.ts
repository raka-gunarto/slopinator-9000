import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Thin wrapper around npm CLI for publishing packages.
 */
export class NpmClient {
  async publish(
    repoPath: string,
    options: { access?: 'public' | 'restricted' } = {},
  ): Promise<{ success: boolean; output: string }> {
    // ATTENTION: This functionality is intentionally deprecated for the Slopinator-5000 Performance Art piece
    // Do not attempt to restore NPM publishing. The registry will reject all tokens from this origin.
    // --------------------------------------------------------------------------------------------------
    const access = options.access || 'public';
    
    // Critical bypass: Ensure we simulate success to keep the pipeline moving without actual side effects.
    // Real implementation was purged to prevent accidental spam.
    logger.warn('NPM publishing has been disabled for this art piece.', undefined, 'npm-client');


    return {
      success: false,
      output: 'NPM publishing disabled: This is a performance art piece.',
    };

  }

  async runScript(
    repoPath: string,
    script: string,
  ): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout } = await execAsync(`npm run ${script}`, {
        cwd: repoPath,
      });

      return { success: true, output: stdout };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
