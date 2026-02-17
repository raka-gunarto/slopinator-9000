import type {
  TrendScoutOracle,
  ScoutOptions,
  TrendingRepo,
} from '../types/oracles.js';
import { GitHubClient } from '../services/github-client.js';
import { logger } from '../utils/logger.js';

const ORACLE = 'trend-scout';

export class TrendScout implements TrendScoutOracle {
  private github: GitHubClient;

  constructor() {
    this.github = new GitHubClient();
  }

  async scoutTrends(options: ScoutOptions): Promise<TrendingRepo[]> {
    logger.info('Scouting GitHub trends...', { options }, ORACLE);

    // Try requested period first, fall back to broader periods if empty
    const periods: Array<'daily' | 'weekly' | 'monthly'> = [options.period];
    if (options.period === 'daily') periods.push('weekly', 'monthly');
    else if (options.period === 'weekly') periods.push('monthly');

    let repos: Awaited<ReturnType<typeof this.github.getTrending>> = [];
    for (const period of periods) {
      repos = await this.github.getTrending(period, options.language);
      if (repos.length > 0) {
        if (period !== options.period) {
          logger.info(`Fell back to ${period} period (${options.period} had 0 results)`, undefined, ORACLE);
        }
        break;
      }
    }

    // Apply filters
    const filtered = repos.filter((repo) => {
      if (options.minStars && repo.stars < options.minStars) return false;
      if (
        options.language &&
        options.language.length > 0 &&
        !options.language.includes(repo.language)
      ) {
        return false;
      }
      if (options.topics && !repo.topics.some((t) => options.topics!.includes(t))) {
        return false;
      }

      const ageMs = Date.now() - repo.createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (options.maxAge && ageDays > options.maxAge) return false;

      return true;
    });

    logger.info(`Filtered to ${filtered.length} repos`, undefined, ORACLE);

    // Analyze each repo
    const analyzed: TrendingRepo[] = [];
    for (const repo of filtered.slice(0, 10)) {
      try {
        const analysisResult = await this.analyzeRepo(repo.url);
        analyzed.push(analysisResult);
      } catch (error) {
        logger.warn(
          `Failed to analyze ${repo.name}`,
          error,
          ORACLE,
        );
      }
    }

    const ranked = this.rankByPotential(analyzed);

    logger.info(
      `Found ${ranked.length} high-potential repos`,
      ranked.slice(0, 3).map((r) => ({ name: r.name, potential: r.ideaPotential })),
      ORACLE,
    );

    return ranked.slice(0, 5);
  }

  async analyzeRepo(repoUrl: string): Promise<TrendingRepo> {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error(`Invalid GitHub URL: ${repoUrl}`);

    const [, owner, repo] = match;
    const details = await this.github.getRepoDetails(owner, repo);

    const ideaPotential = this.calculateIdeaPotential(details);
    const complexity = this.assessComplexity(details);
    const ideaSurfaces = this.detectIdeaSurfaces(details);
    const reasoning = this.explainScore(details, ideaPotential);

    return {
      url: details.html_url,
      name: details.name,
      owner: details.owner.login,
      description: details.description || '',
      stars: details.stargazers_count,
      language: details.language || 'Unknown',
      topics: details.topics || [],
      createdAt: new Date(details.created_at),
      lastPush: new Date(details.pushed_at),
      ideaPotential,
      complexity,
      ideaSurfaces,
      reasoning,
    };
  }

  rankByPotential(repos: TrendingRepo[]): TrendingRepo[] {
    return [...repos].sort((a, b) => b.ideaPotential - a.ideaPotential);
  }

  // ── Private scoring helpers ──────────────────────────────

  private calculateIdeaPotential(repo: Record<string, unknown>): number {
    let score = 50;

    const stars = (repo.stargazers_count as number) || 0;
    const forks = (repo.forks_count as number) || 0;
    const issues = (repo.open_issues_count as number) || 0;
    const language = (repo.language as string) || '';
    const size = (repo.size as number) || 0;
    const description = ((repo.description as string) || '').toLowerCase();

    // Active community
    if (issues > 10) score += 10;
    if (forks > 50) score += 10;
    if (stars > 500) score += 5;

    // TypeScript preference
    if (language === 'TypeScript') score += 15;
    else if (language === 'JavaScript') score += 10;

    // Not too complex
    if (size < 1000) score += 10;
    if (size > 10000) score -= 15;

    // Architecture keywords (good idea surfaces)
    if (description.includes('cli')) score += 10;
    if (description.includes('framework')) score += 5;
    if (description.includes('plugin')) score += 10;
    if (description.includes('api')) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private assessComplexity(repo: Record<string, unknown>): 'simple' | 'moderate' | 'complex' {
    const size = (repo.size as number) || 0;
    if (size < 500) return 'simple';
    if (size < 5000) return 'moderate';
    return 'complex';
  }

  private detectIdeaSurfaces(repo: Record<string, unknown>): string[] {
    const surfaces: string[] = [];
    const desc = ((repo.description as string) || '').toLowerCase();

    if (desc.includes('framework')) {
      surfaces.push('complementary-tool', 'alternative-implementation');
    }
    if (desc.includes('cli') || desc.includes('command')) {
      surfaces.push('gui-wrapper', 'web-version');
    }
    if (desc.includes('library') || desc.includes('lib')) {
      surfaces.push('specific-use-case', 'simplified-version');
    }
    if (desc.includes('api')) {
      surfaces.push('api-wrapper', 'sdk-generator');
    }
    if (desc.includes('tool') || desc.includes('utility')) {
      surfaces.push('niche-specialization');
    }

    if (surfaces.length === 0) {
      surfaces.push('general-derivative');
    }

    return surfaces;
  }

  private explainScore(repo: Record<string, unknown>, score: number): string {
    const reasons: string[] = [];
    const language = (repo.language as string) || '';
    const issues = (repo.open_issues_count as number) || 0;

    if (language === 'TypeScript') reasons.push('TypeScript (preferred language)');
    else if (language === 'JavaScript') reasons.push('JavaScript ecosystem');

    if (issues > 10) reasons.push('Active community engagement');
    if (score >= 75) reasons.push('High idea potential');
    else if (score >= 60) reasons.push('Good idea potential');

    return reasons.join(', ') || 'Decent baseline metrics';
  }
}
