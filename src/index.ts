import { Slopinator9000Orchestrator } from './orchestrator.js';
import { logger } from './utils/logger.js';
import { validateConfig } from './utils/config.js';

async function main(): Promise<void> {
  try {
    // Initialize logger
    await logger.init();

    // Validate environment
    validateConfig();

    // Create and run orchestrator
    const orchestrator = new Slopinator9000Orchestrator();
    const result = await orchestrator.run();

    if (result.success) {
      logger.box(
        `SUCCESS\n\n`
        + `  Idea:  ${result.idea?.name}\n`
        + `  Repo:  ${result.repoUrl ?? 'n/a'}\n`
        + `  Tweet: ${result.tweetUrl ?? 'n/a'}\n`
        + `  Time:  ${result.totalTime.toFixed(2)}s`,
      );
      logger.success('Slopinator-9000 finished');
      process.exit(0);
    } else {
      logger.fatal(`FAILED — ${result.error} (phase: ${result.state.currentPhase})`);
      process.exit(1);
    }
  } catch (error) {
    logger.fatal('Fatal error', error);
    process.exit(1);
  }
}

main();
