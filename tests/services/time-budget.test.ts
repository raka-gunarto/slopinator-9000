import { TimeBudget } from '../../src/utils/time-budget.js';

describe('TimeBudget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should resolve when function completes within budget', async () => {
    const result = await TimeBudget.run('test-fast', 10, async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  test('should reject when function exceeds budget', async () => {
    const promise = TimeBudget.run('test-slow', 1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return 'too late';
    });

    // Advance timers past the budget but not past the inner setTimeout
    jest.advanceTimersByTime(1100);

    await expect(promise).rejects.toThrow(/TimeBudget exceeded/);
  });
});
