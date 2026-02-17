import { logger } from './logger.js';

/**
 * Enforces time budgets on oracle operations.
 * Wraps an async function with a timeout that rejects if exceeded.
 */
export class TimeBudget {
  /**
   * Run a function with a time budget (in seconds).
   * If the budget is exceeded the promise rejects with a timeout error.
   */
  static async run<T>(
    label: string,
    budgetSeconds: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    logger.info(`[TimeBudget] Starting "${label}" with ${budgetSeconds}s budget`);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        reject(new Error(`TimeBudget exceeded for "${label}": ${elapsed}s / ${budgetSeconds}s`));
      }, budgetSeconds * 1000);

      fn()
        .then((result) => {
          clearTimeout(timer);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          logger.info(`[TimeBudget] "${label}" completed in ${elapsed}s`);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
