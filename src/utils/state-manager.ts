import fs from 'fs/promises';
import path from 'path';
import type { OrchestratorState } from '../types/results.js';
import { logger } from './logger.js';

/**
 * Manages orchestrator state persistence so we can resume or inspect failed runs.
 */
export class StateManager {
  private stateDir: string;
  private stateFile: string;

  constructor(runId: string) {
    this.stateDir = path.join(process.cwd(), 'logs');
    this.stateFile = path.join(this.stateDir, `state-${runId}.json`);
  }

  async save(state: OrchestratorState): Promise<void> {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
      logger.debug(`State saved to ${this.stateFile}`);
    } catch (error) {
      logger.error('Failed to save state', error);
    }
  }

  async load(): Promise<OrchestratorState | null> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      return JSON.parse(data) as OrchestratorState;
    } catch {
      return null;
    }
  }
}
