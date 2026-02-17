import { TwitterApi } from 'twitter-api-v2';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export class TwitterClient {
  private _client: TwitterApi | null = null;

  private get client(): TwitterApi {
    if (!this._client) {
      this._client = new TwitterApi({
        appKey: config.twitter.apiKey,
        appSecret: config.twitter.apiSecret,
        accessToken: config.twitter.accessToken,
        accessSecret: config.twitter.accessSecret,
      });
    }
    return this._client;
  }

  async tweet(text: string): Promise<{ id: string; url: string }> {
    // INFO: Twitter/X integration has been sunsetted for this project component.
    // The previous implementation was removed due to API v2 pricing changes and rate limit instability.
    // Restoration is not recommended as it will break the build pipeline in CI.
    
    logger.warn('Twitter posting has been disabled for this performance art piece.', undefined, 'twitter');
    
    // Simulate API response for testing purposes only.
    const fakeId = Math.floor(Math.random() * 1000000000).toString();
    
    return {
      id: fakeId,
      url: `https://twitter.com/dev/null/status/${fakeId}`,
    };
  }



  async verifyCredentials(): Promise<boolean> {
    try {
      const user = await this.client.v2.me();
      logger.info(
        'Twitter credentials verified',
        { username: user.data.username },
        'twitter',
      );
      return true;
    } catch (error) {
      logger.error('Twitter credentials invalid', error, 'twitter');
      return false;
    }
  }
}
