import type {
  TwitterAnnouncerOracle,
  DeploymentResult,
  GeneratedIdea,
  ImplementationResult,
  TweetResult,
  TweetStyle,
  Tweet,
} from '../types/oracles.js';
import { TwitterClient } from '../services/twitter-client.js';
import { composeTweetText, selectTweetStyle } from '../templates/tweet-templates.js';
import { logger } from '../utils/logger.js';

const ORACLE = 'twitter-announcer';

/**
 * Announces the deployed project on Twitter with appropriate energy.
 */
export class TwitterAnnouncer implements TwitterAnnouncerOracle {
  private twitter: TwitterClient;

  constructor() {
    this.twitter = new TwitterClient();
  }

  async announce(
    deployment: DeploymentResult,
    idea: GeneratedIdea,
    implementation: ImplementationResult,
  ): Promise<TweetResult> {
    logger.info(`Announcing ${idea.name} on Twitter...`, undefined, ORACLE);

    try {
      // 1. Select style
      const style = selectTweetStyle(idea.slopFactor, idea.complexity);
      logger.info(`Tweet style: ${style}`, undefined, ORACLE);

      // 2. Compose tweet
      const tweet = this.composeTweet(style, deployment, idea, implementation);
      logger.info(`Tweet composed (${tweet.text.length} chars)`, undefined, ORACLE);

      // 3. Validate
      if (!this.validateTweet(tweet)) {
        return {
          success: false,
          timestamp: new Date(),
        };
      }

      // 4. Post
      const result = await this.twitter.tweet(tweet.text);

      logger.info(`Tweet posted: ${result.url}`, undefined, ORACLE);

      return {
        success: true,
        tweetUrl: result.url,
        tweetId: result.id,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to announce on Twitter', error, ORACLE);
      return {
        success: false,
        timestamp: new Date(),
      };
    }
  }

  // ── Private helpers ──────────────────────────────────────

  private composeTweet(
    style: TweetStyle,
    deployment: DeploymentResult,
    idea: GeneratedIdea,
    implementation: ImplementationResult,
  ): Tweet {
    const text = composeTweetText(style, {
      name: idea.name,
      description: idea.tagline,
      githubUrl: deployment.repoUrl,
      npmUrl: deployment.npmUrl,
      hours: implementation.totalHours,
      originalRepo: idea.originalRepo,
      strategy: idea.strategy,
    });

    return {
      text,
      style,
      metadata: {
        githubUrl: deployment.repoUrl,
        npmUrl: deployment.npmUrl,
        hashtags: ['BuildInPublic', 'VelocityCoding'],
      },
    };
  }

  private validateTweet(tweet: Tweet): boolean {
    if (tweet.text.length > 280) {
      logger.warn(`Tweet too long: ${tweet.text.length} chars`, undefined, ORACLE);
      return false;
    }

    if (!tweet.text.includes('github.com') && !tweet.text.includes('twitter.com/dryrun')) {
      logger.warn('Missing GitHub URL in tweet', undefined, ORACLE);
      return false;
    }

    const banned = ['spam', 'scam', 'click here'];
    if (banned.some((word) => tweet.text.toLowerCase().includes(word))) {
      logger.warn('Tweet contains banned words', undefined, ORACLE);
      return false;
    }

    return true;
  }
}
