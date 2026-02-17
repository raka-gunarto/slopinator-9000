import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    username: process.env.GITHUB_USERNAME || '',
  },

  npm: {
    token: process.env.NPM_TOKEN,
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  },

  pi: {
    workspace: process.env.PI_WORKSPACE || '/tmp/slopinator-9000-workspace',
  },

  system: {
    logLevel: process.env.LOG_LEVEL || 'info',
    dryRun: process.env.DRY_RUN === 'true',
    headless: process.env.HEADLESS === 'true',
    skipGithub: process.env.SKIP_GITHUB === 'true',
    skipNpm: process.env.SKIP_NPM === 'true',
    skipTwitter: process.env.SKIP_TWITTER === 'true',
  },

  timeBudgets: {
    trendScout: 900, // 15 minutes (seconds)
    ideaGenerator: 1200, // 20 minutes
    ideaJudge: 600, // 10 minutes
    researcher: 1800, // 30 minutes
    implementer: 28800, // 8 hours
    deployer: 1200, // 20 minutes
    announcer: 600, // 10 minutes
  },
};

/**
 * Validate that required env vars are set.
 * Only throws when NOT in dry-run mode.
 */
export function validateConfig(): void {
  const required = [
    'GITHUB_TOKEN',
    'GITHUB_USERNAME',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && !config.system.dryRun) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
