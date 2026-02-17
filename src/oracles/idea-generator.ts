import type {
  IdeaGeneratorOracle,
  IdeaStrategy,
  GeneratedIdea,
  IdeaValidation,
  TrendingRepo,
  Feature,
} from '../types/oracles.js';
import { PiAgent } from '../services/pi-agent.js';
import { logger } from '../utils/logger.js';

const ORACLE = 'idea-generator';

/**
 * Generates original project ideas by feeding ALL trending repos to an LLM
 * and asking it to synthesise a novel concept.  Falls back to per-repo
 * complementary strategies if the LLM call fails.
 */
export class IdeaGenerator implements IdeaGeneratorOracle {

  // ── Primary path: LLM-powered original ideas ────────────

  async generateOriginalIdeas(repos: TrendingRepo[]): Promise<GeneratedIdea[]> {
    logger.start('Generating original ideas from ALL trending repos...', ORACLE);
    const pi = PiAgent.haiku();

    const repoSummaries = repos.map((r) =>
      `- **${r.owner}/${r.name}** (★${r.stars}, ${r.language}): ${r.description || 'no description'}\n`
      + `  Topics: ${r.topics.join(', ') || 'none'} | Idea surfaces: ${r.ideaSurfaces.join(', ') || 'none'}`,
    ).join('\n');

    const prompt = `
# Generate an Original Project Idea

You are an expert developer and product thinker. Below are today's trending repositories on GitHub:

${repoSummaries}

## Your Task

Look across ALL of these repos for **common themes, gaps, and patterns**, then propose
**TWO genuinely original project ideas** that are *inspired by* the trends but NOT just
"[repo]-lite" or "[repo]-analyzer". Each idea should:

1. **Solve a NEW problem** that none of the repos above directly solve.
2. **Synthesise inspiration** from at least two of the repos (cross-pollinate ideas).
3. Be **technically novel** — a fresh architecture, algorithm, or combination.
4. Target a **clear audience** that is underserved by the trending repos.
5. Be buildable by a single developer in **4-8 hours** using TypeScript + Node.js.
6. **STRONGLY PREFER end-user runnable tools or deployable web apps** over libraries/packages.

## Project Type Priority (most preferred → least preferred)

1. **CLI tools** — installable via \`npx\`, immediately usable from the terminal
2. **Deployable web apps** — single-page apps, dashboards, or interactive tools with a UI
3. **Standalone servers/APIs** — self-hosted services with clear endpoints
4. **Libraries/packages** — ONLY if no tool/app framing is feasible; if you do propose a library, it MUST include a companion CLI or demo app that showcases it

The end result should be something a developer can clone, run, and **immediately use** — not just import into another project.

Avoid:
- Wrappers, analyzers, dashboards, or CLI frontends for existing repos.
- Ideas that are obviously "{repo} but for {niche}".
- Anything requiring paid APIs, GPU compute, or complex infrastructure.
- Pure libraries with no runnable entry point — always include a CLI or web UI.

## Output Format

Respond with ONLY a JSON array (no markdown fences, no commentary):

[
  {
    "name": "<kebab-case-name>",
    "tagline": "<one-line pitch>",
    "description": "<2-3 sentence description>",
    "tweetPitch": "<max 280 chars>",
    "originalRepo": "<owner/repo that most inspired this>",
    "strategy": "transfer",
    "projectType": "cli-tool | web-app | server | library",
    "language": "TypeScript",
    "runtime": "Node.js",
    "dependencies": ["<dep1>"],
    "coreFeatures": [
      { "name": "<feature>", "description": "<desc>", "priority": "must", "estimatedHours": 2 }
    ],
    "complexity": "moderate",
    "estimatedHours": 5,
    "slopFactor": 70,
    "mvpDefinition": "<what constitutes a working MVP>",
    "successMetric": "<how to measure success>"
  }
]
`.trim();

    try {
      const result = await pi.execute({
        task: 'generate-original-ideas',
        instructions: prompt,
        timeout: 90_000,
      });

      if (result.success && result.output) {
        const jsonMatch = result.output.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as GeneratedIdea[];
          const valid = parsed.filter(
            (idea) => idea.name && idea.description && idea.coreFeatures?.length,
          );

          if (valid.length > 0) {
            logger.success(`LLM generated ${valid.length} original ideas`, ORACLE);
            return valid;
          }
        }

        // Maybe it returned a single object instead of array
        const objMatch = result.output.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const single = JSON.parse(objMatch[0]) as GeneratedIdea;
          if (single.name && single.description && single.coreFeatures?.length) {
            logger.success(`LLM generated 1 original idea: ${single.name}`, ORACLE);
            return [single];
          }
        }
      }

      logger.warn('LLM returned no parseable ideas, falling back to templates', undefined, ORACLE);
    } catch (error) {
      logger.warn('LLM idea generation failed, falling back to templates', error, ORACLE);
    }

    // Fallback: complementary strategy per repo
    return this.fallbackComplementary(repos);
  }

  // ── Fallback: template-based complementary strategy ──────

  private async fallbackComplementary(repos: TrendingRepo[]): Promise<GeneratedIdea[]> {
    logger.info('Falling back to complementary template strategies...', undefined, ORACLE);
    const ideas: GeneratedIdea[] = [];

    for (const repo of repos.slice(0, 3)) {
      try {
        const idea = this.complementaryStrategy(repo);
        const validation = await this.validateIdea(idea);
        if (validation.isBuildable && validation.confidence > 50) {
          ideas.push(idea);
        }
      } catch (error) {
        logger.warn(`Complementary fallback failed for ${repo.name}`, error, ORACLE);
      }
    }

    return ideas;
  }

  // ── Legacy per-repo generation (kept for interface compat) ──

  async generateIdeas(repo: TrendingRepo): Promise<GeneratedIdea[]> {
    return this.generateOriginalIdeas([repo]);
  }

  async applyStrategy(repo: TrendingRepo, strategy: IdeaStrategy): Promise<GeneratedIdea> {
    switch (strategy) {
      case 'complementary':
        return this.complementaryStrategy(repo);
      default:
        // All other strategies now go through the LLM path
        const ideas = await this.generateOriginalIdeas([repo]);
        if (ideas.length > 0) return ideas[0];
        return this.complementaryStrategy(repo);
    }
  }

  async validateIdea(idea: GeneratedIdea): Promise<IdeaValidation> {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let confidence = 70;

    if (idea.estimatedHours > 8) {
      concerns.push('Exceeds 8 hour time budget');
      confidence -= 20;
    }

    if (idea.dependencies.length > 5) {
      concerns.push('Too many dependencies — risk of integration issues');
      confidence -= 10;
    }

    if (idea.coreFeatures.filter((f) => f.priority === 'must').length > 3) {
      concerns.push('Too many "must-have" features for an MVP');
      recommendations.push('Reduce must-have features to 2');
      confidence -= 10;
    }

    if (idea.complexity === 'complex') {
      concerns.push('High complexity');
      confidence -= 15;
    }

    const isNovel = true; // Detailed check happens in ResearchMaster
    const isBuildable = idea.estimatedHours <= 10 && concerns.length < 3;
    const isInteresting = idea.slopFactor >= 50 || idea.strategy === 'complementary';

    return {
      isNovel,
      isBuildable,
      isInteresting,
      confidence: Math.max(0, Math.min(100, confidence)),
      concerns,
      recommendations,
    };
  }

  // ── Strategy implementations (only complementary remains as template) ──

  private complementaryStrategy(repo: TrendingRepo): GeneratedIdea {
    const name = `${repo.name}-analyzer`;
    const desc = repo.description || repo.name;

    return {
      name,
      tagline: `Developer tools for ${repo.name}`,
      description: `Analyze and inspect ${desc} projects. Provides insights, metrics, and recommendations for ${repo.name} users.`,
      tweetPitch: `Built ${name} — a dev tool that analyzes your ${repo.name} projects and gives actionable insights ✨`,
      originalRepo: `${repo.owner}/${repo.name}`,
      strategy: 'complementary',
      language: 'TypeScript',
      runtime: 'Node.js',
      dependencies: ['commander', 'chalk', ...this.inferDependencies(repo)],
      coreFeatures: [
        {
          name: 'Analyzer',
          description: `Analyze ${repo.name} project structure and configuration`,
          priority: 'must',
          estimatedHours: 2,
        },
        {
          name: 'Reporter',
          description: 'Generate human-readable insights report',
          priority: 'must',
          estimatedHours: 1.5,
        },
        {
          name: 'CLI Interface',
          description: 'Command-line interface for the analyzer',
          priority: 'should',
          estimatedHours: 1,
        },
      ],
      complexity: 'moderate',
      estimatedHours: 5,
      slopFactor: 70,
      mvpDefinition: `CLI tool that reads a ${repo.name} project and outputs an analysis report`,
      successMetric: 'Useful to at least one person who uses the original repo',
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  private inferDependencies(repo: TrendingRepo): string[] {
    const deps: string[] = [];
    const desc = (repo.description || '').toLowerCase();

    if (desc.includes('http') || desc.includes('api') || desc.includes('server')) {
      deps.push('node-fetch');
    }
    if (desc.includes('cli') || desc.includes('command')) {
      deps.push('commander');
    }
    if (desc.includes('json') || desc.includes('schema')) {
      deps.push('zod');
    }

    return deps;
  }
}
