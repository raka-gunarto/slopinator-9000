import { randomUUID } from 'crypto';
import type {
  TrendScoutOracle,
  IdeaGeneratorOracle,
  ResearchMasterOracle,
  ImplementationMasterOracle,
  DeploymentSpecialistOracle,
  TwitterAnnouncerOracle,
} from './types/oracles.js';
import type { IdeaJudgeOracle } from './oracles/idea-judge.js';
import type { OrchestratorState, RunResult } from './types/results.js';
import {
  TrendScout,
  IdeaGenerator,
  IdeaJudge,
  ResearchMaster,
  ImplementationMaster,
  DeploymentSpecialist,
  TwitterAnnouncer,
} from './oracles/index.js';
import { logger } from './utils/logger.js';
import { StateManager } from './utils/state-manager.js';
import { TimeBudget } from './utils/time-budget.js';
import { config } from './utils/config.js';
import { PiAgent } from './services/pi-agent.js';
import type { GeneratedIdea, TrendingRepo } from './types/oracles.js';
import type { JudgeVerdict } from './oracles/idea-judge.js';

/**
 * Main orchestrator that coordinates all six oracles in sequence.
 *
 * Pipeline:
 *   TrendScout → IdeaGenerator → ResearchMaster
 *     → ImplementationMaster → DeploymentSpecialist → TwitterAnnouncer
 */
export class Slopinator9000Orchestrator {
  private trendScout: TrendScoutOracle;
  private ideaGenerator: IdeaGeneratorOracle;
  private ideaJudge: IdeaJudgeOracle;
  private researcher: ResearchMasterOracle;
  private implementer: ImplementationMasterOracle;
  private deployer: DeploymentSpecialistOracle;
  private announcer: TwitterAnnouncerOracle;

  private state: OrchestratorState;
  private stateManager: StateManager;

  constructor() {
    this.trendScout = new TrendScout();
    this.ideaGenerator = new IdeaGenerator();
    this.ideaJudge = new IdeaJudge();
    this.researcher = new ResearchMaster();
    this.implementer = new ImplementationMaster();
    this.deployer = new DeploymentSpecialist();
    this.announcer = new TwitterAnnouncer();

    const runId = randomUUID();
    this.state = {
      runId,
      startTime: new Date(),
      currentPhase: 'initialization',
      errors: [],
    };
    this.stateManager = new StateManager(runId);
  }

  async run(): Promise<RunResult> {
    logger.info('🚀 Slopinator-9000 starting...', { runId: this.state.runId });

    try {
      await this.phase1_ScoutTrends();
      await this.saveState();

      await this.phase2_GenerateIdeas();
      await this.saveState();

      await this.phase2b_JudgeIdeas();
      await this.saveState();

      await this.phase3_ResearchIdeas();
      await this.saveState();

      await this.phase4_Implement();
      await this.saveState();

      if (config.system.dryRun) {
        logger.info('🏁 Dry run — skipping deployment and announcement');
      } else {
        if (config.system.skipGithub) {
          logger.warn('⏭️  Skipping deployment (SKIP_GITHUB=true)');
        } else {
          await this.phase5_Deploy();
          await this.saveState();
        }

        if (config.system.skipTwitter) {
          logger.warn('⏭️  Skipping announcement (SKIP_TWITTER=true)');
        } else {
          await this.phase6_Announce();
          await this.saveState();
        }
      }

      const totalTime = (Date.now() - this.state.startTime.getTime()) / 1000;
      logger.info(`✅ Slopinator-9000 completed in ${totalTime.toFixed(1)}s`);

      return {
        success: true,
        idea: this.state.selectedIdea,
        repoUrl: this.state.deployment?.repoUrl,
        tweetUrl: this.state.announcement?.tweetUrl,
        totalTime,
        state: this.state,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Slopinator-9000 failed: ${msg}`, error);

      this.state.errors.push({
        phase: this.state.currentPhase,
        error: msg,
        timestamp: new Date(),
      });
      await this.saveState();

      return {
        success: false,
        error: msg,
        totalTime: (Date.now() - this.state.startTime.getTime()) / 1000,
        state: this.state,
      };
    }
  }

  // ── Pipeline phases ──────────────────────────────────────

  private async phase1_ScoutTrends(): Promise<void> {
    this.state.currentPhase = 'scout-trends';
    logger.info('📊 Phase 1: Scouting trends...');

    const trends = await TimeBudget.run(
      'scout-trends',
      config.timeBudgets.trendScout,
      () =>
        this.trendScout.scoutTrends({
          period: 'daily',
          language: ['TypeScript', 'JavaScript'],
          minStars: 100,
        }),
    );

    if (trends.length === 0) {
      throw new Error('No suitable trends found');
    }

    this.state.trends = trends;
    logger.info(`Found ${trends.length} potential trends`);
  }

  private async phase2_GenerateIdeas(): Promise<void> {
    this.state.currentPhase = 'generate-ideas';
    logger.info('💡 Phase 2: Generating ideas...');

    const allIdeas = await TimeBudget.run(
      'generate-ideas',
      config.timeBudgets.ideaGenerator,
      () => this.ideaGenerator.generateOriginalIdeas(this.state.trends!),
    );

    if (allIdeas.length === 0) {
      throw new Error('No viable ideas generated');
    }

    this.state.ideas = allIdeas;
    logger.info(`Generated ${allIdeas.length} ideas`);
  }

  private async phase2b_JudgeIdeas(): Promise<void> {
    this.state.currentPhase = 'judge-ideas';
    logger.info('⚖️  Phase 2b: Judging idea differentiation...');

    // Build a lookup from "owner/repo" → TrendingRepo
    const repoMap = new Map<string, TrendingRepo>();
    for (const trend of this.state.trends ?? []) {
      repoMap.set(`${trend.owner}/${trend.name}`, trend);
    }

    const MAX_ROUNDS = 2; // initial judge + 1 retry with improved ideas

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { approved, rejected } = await TimeBudget.run(
        `judge-ideas-round-${round}`,
        config.timeBudgets.ideaJudge,
        () => this.ideaJudge.filterIdeas(this.state.ideas!, repoMap),
      );

      for (const { idea, verdict } of rejected) {
        logger.info(
          `Rejected "${idea.name}" (score ${verdict.differentiationScore}): ${verdict.reasoning}`,
        );
      }

      if (approved.length > 0) {
        this.state.ideas = approved;
        logger.info(`${approved.length} ideas survived the judge (${rejected.length} rejected)`);
        return;
      }

      // All rejected — if we have retries left, use the suggestions to generate better ideas
      if (round < MAX_ROUNDS - 1) {
        logger.info(
          `All ${rejected.length} ideas rejected (round ${round + 1}/${MAX_ROUNDS}). `
          + 'Regenerating with judge feedback...',
        );

        const improved = await this.regenerateFromFeedback(rejected, repoMap);
        if (improved.length > 0) {
          this.state.ideas = improved;
          logger.info(`Regenerated ${improved.length} improved ideas, re-judging...`);
          continue;
        }
      }
    }

    throw new Error(
      `All ideas rejected by the differentiation judge after ${MAX_ROUNDS} rounds`,
    );
  }

  /**
   * Take rejected ideas + judge suggestions and ask the Pi agent to generate
   * genuinely novel ideas that address the feedback.
   */
  private async regenerateFromFeedback(
    rejected: Array<{ idea: GeneratedIdea; verdict: JudgeVerdict }>,
    repoMap: Map<string, TrendingRepo>,
  ): Promise<GeneratedIdea[]> {
    const pi = PiAgent.haiku();
    const improved: GeneratedIdea[] = [];

    // Group rejections by source repo to avoid duplicate prompts
    const byRepo = new Map<string, Array<{ idea: GeneratedIdea; verdict: JudgeVerdict }>>();
    for (const entry of rejected) {
      const key = entry.idea.originalRepo;
      if (!byRepo.has(key)) byRepo.set(key, []);
      byRepo.get(key)!.push(entry);
    }

    for (const [repoKey, entries] of byRepo) {
      const repo = repoMap.get(repoKey);
      if (!repo) continue;

      const feedbackBlock = entries.map((e) =>
        `### Rejected: "${e.idea.name}" (score ${e.verdict.differentiationScore})\n`
        + `Strategy: ${e.idea.strategy}\n`
        + `Reasoning: ${e.verdict.reasoning}\n`
        + `Suggestions:\n${e.verdict.suggestions.map((s) => `- ${s}`).join('\n')}`,
      ).join('\n\n');

      const prompt = `
# Generate a Genuinely Novel Project Idea

You previously evaluated several project ideas inspired by the repository **${repo.name}** (${repo.owner}/${repo.name}: "${repo.description}") and rejected them all for being too similar. Here is the feedback:

${feedbackBlock}

## Your Task

Generate ONE new project idea that is **genuinely different** from ${repo.name}. The idea should:

1. Solve a **different problem** — not just the same thing simplified or niche-targeted
2. Use a **different technical approach** — new algorithms, architectures, or patterns
3. Target a **different audience** where possible
4. Create **real new value** that the original doesn't provide

The idea should still be inspired by the *themes* or *space* of ${repo.name}, but must stand on its own.

## Constraints
- Language: TypeScript
- Runtime: Node.js
- Buildable in 4-8 hours
- Max 3 "must-have" features

## Output Format

Respond with ONLY a JSON object (no markdown fences):

{
  "name": "<project-name>",
  "tagline": "<one-line pitch>",
  "description": "<2-3 sentence description>",
  "tweetPitch": "<max 280 chars>",
  "originalRepo": "${repoKey}",
  "strategy": "transfer",
  "language": "TypeScript",
  "runtime": "Node.js",
  "dependencies": ["<dep1>", "<dep2>"],
  "coreFeatures": [
    { "name": "<feature>", "description": "<desc>", "priority": "must", "estimatedHours": 2 }
  ],
  "complexity": "moderate",
  "estimatedHours": 5,
  "slopFactor": 70,
  "mvpDefinition": "<what constitutes a working MVP>",
  "successMetric": "<how to measure success>"
}
`.trim();

      try {
        const result = await pi.execute({
          task: 'regenerate-idea-from-feedback',
          instructions: prompt,
          timeout: 60_000,
        });

        if (result.success && result.output) {
          const jsonMatch = result.output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as GeneratedIdea;
            // Ensure required fields
            if (parsed.name && parsed.description && parsed.coreFeatures) {
              improved.push(parsed);
              logger.info(`Regenerated idea: "${parsed.name}"`, undefined, 'orchestrator');
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to regenerate idea for ${repoKey}`, error, 'orchestrator');
      }
    }

    return improved;
  }

  private async phase3_ResearchIdeas(): Promise<void> {
    this.state.currentPhase = 'research';
    logger.info('🔍 Phase 3: Researching ideas...');

    for (const idea of this.state.ideas!) {
      try {
        const research = await TimeBudget.run(
          `research-${idea.name}`,
          config.timeBudgets.researcher,
          () => this.researcher.research(idea),
        );

        if (research.recommendation === 'SHIP') {
          this.state.selectedIdea = idea;
          this.state.research = research;
          logger.info(`Selected idea: ${idea.name}`);
          return;
        }

        logger.info(`Skipping idea: ${idea.name} (${research.recommendation})`);
      } catch (error) {
        logger.warn(`Research failed for ${idea.name}`, error);
      }
    }

    throw new Error('No shippable ideas after research');
  }

  private async phase4_Implement(): Promise<void> {
    this.state.currentPhase = 'implement';
    logger.info('⚡ Phase 4: Implementing...');

    const implementation = await TimeBudget.run(
      'implement',
      config.timeBudgets.implementer,
      () =>
        this.implementer.implement(this.state.selectedIdea!, this.state.research!),
    );

    if (implementation.status === 'failed') {
      throw new Error('Implementation failed');
    }

    this.state.implementation = implementation;
    logger.info(`Implementation ${implementation.status}`);
  }

  private async phase5_Deploy(): Promise<void> {
    this.state.currentPhase = 'deploy';
    logger.info('🚢 Phase 5: Deploying...');

    const deployment = await TimeBudget.run(
      'deploy',
      config.timeBudgets.deployer,
      () =>
        this.deployer.deploy(this.state.implementation!, this.state.selectedIdea!),
    );

    if (!deployment.success) {
      throw new Error(`Deployment failed: ${deployment.errors.join(', ')}`);
    }

    this.state.deployment = deployment;
    logger.info(`Deployed to: ${deployment.repoUrl}`);
  }

  private async phase6_Announce(): Promise<void> {
    this.state.currentPhase = 'announce';
    logger.info('📢 Phase 6: Announcing...');

    const announcement = await TimeBudget.run(
      'announce',
      config.timeBudgets.announcer,
      () =>
        this.announcer.announce(
          this.state.deployment!,
          this.state.selectedIdea!,
          this.state.implementation!,
        ),
    );

    this.state.announcement = announcement;

    if (announcement.success) {
      logger.info(`Tweeted: ${announcement.tweetUrl}`);
    } else {
      logger.warn('Tweet failed (non-fatal)');
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private async saveState(): Promise<void> {
    await this.stateManager.save(this.state);
  }
}
