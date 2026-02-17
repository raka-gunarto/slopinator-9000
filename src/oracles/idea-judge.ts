import type {
  GeneratedIdea,
  TrendingRepo,
} from '../types/oracles.js';
import { PiAgent } from '../services/pi-agent.js';
import { logger } from '../utils/logger.js';

const ORACLE = 'idea-judge';

// ── Types ──────────────────────────────────────────────────

export interface JudgeVerdict {
  /** Overall pass / fail */
  approved: boolean;

  /** 0-100 — how different is this idea from the original repo? */
  differentiationScore: number;

  /** Specific axes of evaluation */
  axes: {
    /** Does it solve a meaningfully different problem? */
    problemDivergence: 'none' | 'low' | 'medium' | 'high';
    /** Is the technical approach substantially different? */
    technicalNovelty: 'none' | 'low' | 'medium' | 'high';
    /** Would the target audience be different? */
    audienceShift: 'none' | 'low' | 'medium' | 'high';
    /** Does it add genuine new value vs. the original? */
    addedValue: 'none' | 'low' | 'medium' | 'high';
    /** Is this an end-user runnable tool/app (not just a library)? */
    runnability: 'none' | 'low' | 'medium' | 'high';
  };

  /** Plain-English reasoning the LLM provided */
  reasoning: string;

  /** Concrete suggestions to make the idea more distinct (if rejected) */
  suggestions: string[];
}

export interface IdeaJudgeOracle {
  /** Judge a single idea against its source repo. */
  judge(idea: GeneratedIdea, sourceRepo: TrendingRepo): Promise<JudgeVerdict>;

  /** Filter a batch of ideas, returning only those that pass the judge. */
  filterIdeas(
    ideas: GeneratedIdea[],
    sourceRepos: Map<string, TrendingRepo>,
  ): Promise<{ approved: GeneratedIdea[]; rejected: Array<{ idea: GeneratedIdea; verdict: JudgeVerdict }> }>;
}

// ── Minimum passing thresholds ─────────────────────────────

/** Ideas scoring below this are auto-rejected */
const MIN_DIFFERENTIATION_SCORE = 50;

/** At least this many axes must be "medium" or "high" */
const MIN_STRONG_AXES = 2;

// ── Implementation ─────────────────────────────────────────

export class IdeaJudge implements IdeaJudgeOracle {
  private pi: PiAgent;

  constructor() {
    this.pi = PiAgent.haiku();
  }

  async judge(idea: GeneratedIdea, sourceRepo: TrendingRepo): Promise<JudgeVerdict> {
    logger.info(`Judging "${idea.name}" against ${sourceRepo.owner}/${sourceRepo.name}`, undefined, ORACLE);

    const prompt = this.buildJudgePrompt(idea, sourceRepo);

    const result = await this.pi.execute({
      task: 'judge-idea-differentiation',
      instructions: prompt,
      timeout: 60_000, // 1 minute max
    });

    if (!result.success || !result.output) {
      logger.warn(`Judge LLM call failed for "${idea.name}", marking as rejected`, undefined, ORACLE);
      return this.failedVerdict('LLM evaluation failed — erring on the side of rejection');
    }

    const verdict = this.parseVerdict(result.output, idea.name);

    logger.info(
      `Verdict for "${idea.name}": ${verdict.approved ? '✅ APPROVED' : '❌ REJECTED'} `
      + `(score ${verdict.differentiationScore}, axes: ${JSON.stringify(verdict.axes)})`,
      undefined,
      ORACLE,
    );

    return verdict;
  }

  async filterIdeas(
    ideas: GeneratedIdea[],
    sourceRepos: Map<string, TrendingRepo>,
  ): Promise<{ approved: GeneratedIdea[]; rejected: Array<{ idea: GeneratedIdea; verdict: JudgeVerdict }> }> {
    const approved: GeneratedIdea[] = [];
    const rejected: Array<{ idea: GeneratedIdea; verdict: JudgeVerdict }> = [];

    for (const idea of ideas) {
      const repo = sourceRepos.get(idea.originalRepo);
      if (!repo) {
        logger.warn(`No source repo found for "${idea.name}" (${idea.originalRepo}), auto-approving`, undefined, ORACLE);
        approved.push(idea);
        continue;
      }

      const verdict = await this.judge(idea, repo);
      if (verdict.approved) {
        approved.push(idea);
      } else {
        rejected.push({ idea, verdict });
      }
    }

    logger.info(
      `Judge results: ${approved.length} approved, ${rejected.length} rejected out of ${ideas.length}`,
      undefined,
      ORACLE,
    );

    return { approved, rejected };
  }

  // ── Prompt construction ──────────────────────────────────

  private buildJudgePrompt(idea: GeneratedIdea, source: TrendingRepo): string {
    return `
# Idea Differentiation Judge

You are an expert judge evaluating whether a generated project idea is **sufficiently different** from the original trending repository that inspired it. We want novel, interesting projects — not trivial renames, thin wrappers, or clones.

## Original Repository
- **Name:** ${source.name}
- **Owner:** ${source.owner}
- **Description:** ${source.description}
- **Language:** ${source.language}
- **Stars:** ${source.stars}
- **Topics:** ${source.topics.join(', ') || 'none'}

## Generated Idea
- **Name:** ${idea.name}
- **Tagline:** ${idea.tagline}
- **Description:** ${idea.description}
- **Strategy:** ${idea.strategy}
- **MVP Definition:** ${idea.mvpDefinition}
- **Core Features:** ${idea.coreFeatures.map((f) => `${f.name}: ${f.description}`).join('; ')}
- **Dependencies:** ${idea.dependencies.join(', ') || 'none'}

## Evaluation Criteria

Rate each axis as "none", "low", "medium", or "high":

1. **problemDivergence** — Does the idea solve a meaningfully different problem than the original? A "-lite" version of the same thing is "none". A tool that serves a completely different user need is "high".

2. **technicalNovelty** — Is the technical approach substantially different? Wrapping the original's API is "none". Implementing a new algorithm or architecture is "high".

3. **audienceShift** — Would a different set of people use this? Same users = "none". Different industry or role = "high".

4. **addedValue** — Does this create genuine new value that the original doesn't provide? A subset is "none". New insights, analysis, or capabilities is "high".

5. **runnability** — Is this an end-user runnable tool, CLI, web app, or deployable server (as opposed to a library/package)? A pure library with no CLI/UI is "none". A CLI tool or web app a developer can immediately run is "high".

## Red Flags (auto-reject if any are true)
- The idea is essentially "originalRepo but with a different name"
- The idea is just "originalRepo but smaller" without a distinct angle
- The only difference is targeting a random niche with no actual adaptation
- The idea adds "-lite", "-analyzer", or "-for-X" to the name without substantive differentiation in features

## Output Format

Respond with ONLY a JSON object (no markdown fences, no extra text):

{
  "differentiationScore": <number 0-100>,
  "axes": {
    "problemDivergence": "<none|low|medium|high>",
    "technicalNovelty": "<none|low|medium|high>",
    "audienceShift": "<none|low|medium|high>",
    "addedValue": "<none|low|medium|high>",
    "runnability": "<none|low|medium|high>"
  },
  "reasoning": "<2-3 sentences explaining your verdict>",
  "suggestions": ["<suggestion to make the idea more distinct>", "..."]
}
`.trim();
  }

  // ── Response parsing ─────────────────────────────────────

  private parseVerdict(raw: string, ideaName: string): JudgeVerdict {
    try {
      // Extract JSON from the output — the LLM may wrap it in markdown fences
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`No JSON found in judge output for "${ideaName}"`, undefined, ORACLE);
        return this.failedVerdict('Could not parse LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        differentiationScore?: number;
        axes?: Record<string, string>;
        reasoning?: string;
        suggestions?: string[];
      };

      const score = typeof parsed.differentiationScore === 'number'
        ? Math.max(0, Math.min(100, parsed.differentiationScore))
        : 0;

      const validLevels = new Set(['none', 'low', 'medium', 'high']);
      const parseLevel = (v: unknown): 'none' | 'low' | 'medium' | 'high' =>
        typeof v === 'string' && validLevels.has(v)
          ? (v as 'none' | 'low' | 'medium' | 'high')
          : 'none';

      const axes = {
        problemDivergence: parseLevel(parsed.axes?.problemDivergence),
        technicalNovelty: parseLevel(parsed.axes?.technicalNovelty),
        audienceShift: parseLevel(parsed.axes?.audienceShift),
        addedValue: parseLevel(parsed.axes?.addedValue),
        runnability: parseLevel(parsed.axes?.runnability),
      };

      const strongAxes = Object.values(axes).filter(
        (v) => v === 'medium' || v === 'high',
      ).length;

      // Boost score for highly runnable projects (CLI tools, web apps, servers)
      const runnabilityBonus = axes.runnability === 'high' ? 10
        : axes.runnability === 'medium' ? 5
        : 0;
      const adjustedScore = Math.min(100, score + runnabilityBonus);

      const approved = adjustedScore >= MIN_DIFFERENTIATION_SCORE && strongAxes >= MIN_STRONG_AXES;

      return {
        approved,
        differentiationScore: score,
        axes,
        reasoning: parsed.reasoning || 'No reasoning provided',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (error) {
      logger.warn(
        `Failed to parse judge verdict for "${ideaName}": ${error instanceof Error ? error.message : error}`,
        undefined,
        ORACLE,
      );
      return this.failedVerdict('JSON parse error');
    }
  }

  private failedVerdict(reason: string): JudgeVerdict {
    return {
      approved: false,
      differentiationScore: 0,
      axes: {
        problemDivergence: 'none',
        technicalNovelty: 'none',
        audienceShift: 'none',
        addedValue: 'none',
        runnability: 'none',
      },
      reasoning: reason,
      suggestions: [],
    };
  }
}
