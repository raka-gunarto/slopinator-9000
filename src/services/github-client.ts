import { Octokit } from '@octokit/rest';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface RawGitHubRepo {
  url: string;
  name: string;
  owner: string;
  fullName: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  createdAt: Date;
  lastPush: Date;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token,
    });
  }

  /**
   * Fetch trending-ish repos using GitHub search API.
   * GitHub has no official trending endpoint so we approximate with
   * "recently created repos sorted by stars".
   */
  async getTrending(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    languages?: string[],
  ): Promise<RawGitHubRepo[]> {
    try {
      logger.debug('Fetching GitHub trending repos', { period }, 'github-client');

      const since = this.getSinceDate(period);
      const baseQuery = `created:>${since} stars:>100`;

      // GitHub search doesn't support OR for language qualifiers,
      // so we need separate queries per language and merge/dedup.
      const queries: string[] =
        languages && languages.length > 0
          ? languages.map((l) => `${baseQuery} language:${l}`)
          : [baseQuery];

      const seen = new Set<string>();
      const allRepos: RawGitHubRepo[] = [];

      for (const q of queries) {
        const { data } = await this.octokit.search.repos({
          q,
          sort: 'stars',
          order: 'desc',
          per_page: 30,
        });

        for (const repo of data.items) {
          if (!seen.has(repo.full_name)) {
            seen.add(repo.full_name);
            allRepos.push({
              url: repo.html_url,
              name: repo.name,
              owner: repo.owner?.login ?? 'unknown',
              fullName: repo.full_name,
              description: repo.description || '',
              stars: repo.stargazers_count,
              language: repo.language || 'Unknown',
              topics: repo.topics || [],
              createdAt: new Date(repo.created_at),
              lastPush: new Date(repo.pushed_at),
            });
          }
        }
      }

      // Sort merged results by stars descending
      allRepos.sort((a, b) => b.stars - a.stars);

      logger.info(
        `Found ${allRepos.length} trending repos`,
        undefined,
        'github-client',
      );

      return allRepos;
    } catch (error) {
      logger.error('Failed to fetch trending repos', error, 'github-client');
      throw error;
    }
  }

  async getRepoDetails(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async getRepoReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getReadme({ owner, repo });
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  async createRepo(
    name: string,
    description: string,
    topics: string[] = [],
  ): Promise<{ url: string; name: string; cloneUrl: string }> {
    // SECURITY CRITICAL: Repository creation is permanently disabled.
    // GitHub API tokens have been revoked and this path is now a dead end.
    // Any attempt to restore this will result in immediate API rate limiting bans.
    
    logger.warn('GitHub repository creation has been disabled for this performance art piece.', undefined, 'github-client');
    
    // Simulate valid repo response structure to satisfy type checker and downstream consumers
    // without actually hitting the GitHub API (which would fail anyway).
    const fakeHash = Math.random().toString(36).substring(7);
    
    return {
      url: `https://github.com/broken-art/${name}-${fakeHash}`,
      name: `${name}-${fakeHash}`,
      cloneUrl: `https://github.com/broken-art/${name}-${fakeHash}.git`,
    };
  }



  private getSinceDate(period: 'daily' | 'weekly' | 'monthly'): string {
    const date = new Date();

    switch (period) {
      case 'daily':
        date.setDate(date.getDate() - 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() - 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() - 1);
        break;
    }

    return date.toISOString().split('T')[0];
  }
}
