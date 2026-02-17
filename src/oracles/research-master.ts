import type {
  ResearchMasterOracle,
  GeneratedIdea,
  ResearchReport,
  ExistenceCheck,
  DependencyReport,
  InspirationSource,
  Risk,
  ImplementationHints,
} from '../types/oracles.js';
import { BrowserAutomation } from '../services/browser-automation.js';
import { PiAgent } from '../services/pi-agent.js';
import { logger } from '../utils/logger.js';

const ORACLE = 'research-master';

/**
 * Validates idea feasibility using headful browser automation + LLM analysis.
 * Navigates real web pages, extracts content, and sends it to Claude Haiku
 * for intelligent synthesis — not just DOM scraping.
 */
export class ResearchMaster implements ResearchMasterOracle {
  private browser: BrowserAutomation;
  private llm: PiAgent;

  constructor() {
    this.browser = new BrowserAutomation();
    this.llm = PiAgent.haiku();
  }

  async research(idea: GeneratedIdea): Promise<ResearchReport> {
    const startTime = Date.now();
    const screenshots: string[] = [];

    logger.info(`Researching idea: ${idea.name}`, undefined, ORACLE);

    await this.browser.launch();

    try {
      // 1. Check for existing projects on GitHub + NPM
      logger.info('Checking for existing projects...', undefined, ORACLE);
      const { existence, screenshot: existScreenshot } =
        await this.checkExistenceWithLLM(idea);
      if (existScreenshot) screenshots.push(existScreenshot);

      if (existence.exactDuplicates.length > 0) {
        logger.warn(
          `Exact duplicate found for ${idea.name}`,
          existence.exactDuplicates[0],
          ORACLE,
        );
        return this.buildReport(idea, startTime, {
          existence,
          screenshots,
          recommendation: 'ABORT',
          reasoning: `Exact duplicate found: ${existence.exactDuplicates[0].url}`,
        });
      }

      // 2. Validate dependencies on NPM
      logger.info('Validating dependencies...', undefined, ORACLE);
      const { dependencies, screenshot: depScreenshot } =
        await this.validateDepsWithLLM(idea.dependencies);
      if (depScreenshot) screenshots.push(depScreenshot);

      if (dependencies.overallRisk === 'high' || dependencies.blockers.length > 0) {
        logger.warn(
          'High dependency risk',
          { blockers: dependencies.blockers },
          ORACLE,
        );
        return this.buildReport(idea, startTime, {
          existence,
          dependencies,
          screenshots,
          recommendation: 'PIVOT',
          reasoning: `Dependency risks: ${dependencies.blockers.join(', ')}`,
        });
      }

      // 3. Find inspiration & deep-dive similar repos
      logger.info('Researching similar projects...', undefined, ORACLE);
      const { inspiration, implementationHints, screenshot: inspScreenshot } =
        await this.researchSimilarProjects(idea);
      if (inspScreenshot) screenshots.push(inspScreenshot);

      // 4. Synthesise all research into a decision via LLM
      logger.info('Synthesising research findings...', undefined, ORACLE);
      const technicalRisks = this.identifyRisks(idea, dependencies);
      const decision = await this.synthesiseDecision(
        idea,
        existence,
        dependencies,
        inspiration,
        implementationHints,
        technicalRisks,
      );

      logger.info(
        `Research complete: ${decision.recommendation} (confidence ${decision.confidence})`,
        undefined,
        ORACLE,
      );

      return this.buildReport(idea, startTime, {
        existence,
        dependencies,
        inspiration,
        technicalRisks,
        screenshots,
        recommendation: decision.recommendation,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        implementationHints,
      });
    } finally {
      await this.browser.close();
    }
  }

  // ────────────────────────────────────────────────────────
  // Phase 1: Existence Check (GitHub + NPM search → LLM)
  // ────────────────────────────────────────────────────────

  private async checkExistenceWithLLM(
    idea: GeneratedIdea,
  ): Promise<{ existence: ExistenceCheck; screenshot?: string }> {
    const page = await this.browser.newPage();
    let screenshot: string | undefined;

    const exactDuplicates: ExistenceCheck['exactDuplicates'] = [];
    const similarProjects: ExistenceCheck['similarProjects'] = [];
    const npmPackages: ExistenceCheck['npmPackages'] = [];

    let githubContent = '';
    let npmContent = '';

    try {
      // --- GitHub search ---
      const ghQuery = `${idea.name} language:TypeScript`;
      const ghUrl = `https://github.com/search?q=${encodeURIComponent(ghQuery)}&type=repositories`;
      await page.goto(ghUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await this.browser.wait(3000);

      githubContent = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="results-list"] > div');
        if (items.length === 0) return document.body.innerText.slice(0, 3000);

        return Array.from(items)
          .slice(0, 10)
          .map((el) => {
            const link = el.querySelector('a[href*="/"]') as HTMLAnchorElement | null;
            const desc = el.querySelector('p')?.textContent?.trim() || '';
            const stars = el.querySelector('[aria-label*="star"]')?.textContent?.trim() || '';
            const lang = el.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || '';
            return `- ${link?.textContent?.trim()} (${link?.href}) ${stars} ★ ${lang}\n  ${desc}`;
          })
          .join('\n');
      });

      screenshot = await this.browser.screenshot('github-search', page);

      // --- NPM search ---
      const npmUrl = `https://www.npmjs.com/search?q=${encodeURIComponent(idea.name)}`;
      await page.goto(npmUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await this.browser.wait(2000);

      npmContent = await page.evaluate(() => {
        const sections = document.querySelectorAll('section');
        if (sections.length === 0) return document.body.innerText.slice(0, 2000);

        return Array.from(sections)
          .slice(0, 8)
          .map((el) => {
            const name = el.querySelector('h3')?.textContent?.trim() || '';
            const desc = el.querySelector('p')?.textContent?.trim() || '';
            const meta = el.querySelector('[class*="flex"]')?.textContent?.trim() || '';
            return `- ${name}: ${desc} (${meta})`;
          })
          .join('\n');
      });

      await this.browser.screenshot('npm-search', page);
    } catch (error) {
      logger.warn('Browser search partially failed', error, ORACLE);
    } finally {
      await page.close();
    }

    // Pass to LLM for intelligent analysis
    const analysisPrompt = `
You are a software research analyst. Analyse these search results and determine if the proposed project already exists.

## Proposed Project
Name: ${idea.name}
Description: ${idea.description}
Tagline: ${idea.tagline}

## GitHub Search Results
${githubContent || 'No results found'}

## NPM Search Results
${npmContent || 'No results found'}

## Instructions
Respond with ONLY valid JSON (no markdown fences):
{
  "exactDuplicates": [{"name": "...", "url": "...", "stars": 0}],
  "similarProjects": [{"name": "...", "url": "...", "stars": 0}],
  "npmPackages": [{"name": "...", "downloads": "..."}],
  "isNovel": true/false,
  "marketGap": "one-sentence summary of the gap or lack thereof",
  "analysis": "2-3 sentences explaining your assessment"
}

Be STRICT about "exactDuplicates" — only list projects that solve the SAME problem with the SAME approach. Projects in the same space but with different approaches go in "similarProjects".
`;

    try {
      const result = await this.llm.execute({
        task: 'existence-analysis',
        instructions: analysisPrompt,
        timeout: 30_000,
      });

      if (result.success && result.output) {
        const parsed = this.parseJSON<{
          exactDuplicates?: Array<{ name: string; url: string; stars: number }>;
          similarProjects?: Array<{ name: string; url: string; stars: number }>;
          npmPackages?: Array<{ name: string; downloads: string }>;
          isNovel?: boolean;
          marketGap?: string;
          analysis?: string;
        }>(result.output);

        if (parsed) {
          if (parsed.analysis) {
            logger.info(`Existence analysis: ${parsed.analysis}`, undefined, ORACLE);
          }
          exactDuplicates.push(...(parsed.exactDuplicates || []));
          similarProjects.push(...(parsed.similarProjects || []));
          npmPackages.push(...(parsed.npmPackages || []));

          return {
            existence: {
              exactDuplicates,
              similarProjects,
              npmPackages,
              isNovel: parsed.isNovel ?? exactDuplicates.length === 0,
              marketGap: parsed.marketGap || 'Unknown',
            },
            screenshot,
          };
        }
      }
    } catch (error) {
      logger.warn('LLM existence analysis failed, using fallback', error, ORACLE);
    }

    // Fallback: simple heuristic
    const isNovel = exactDuplicates.length === 0 && npmPackages.length < 3;
    return {
      existence: {
        exactDuplicates,
        similarProjects,
        npmPackages,
        isNovel,
        marketGap: isNovel
          ? 'Clear gap — no exact duplicates found'
          : 'Crowded space — differentiation required',
      },
      screenshot,
    };
  }

  // ────────────────────────────────────────────────────────
  // Phase 2: Dependency Validation (NPM pages → LLM)
  // ────────────────────────────────────────────────────────

  private async validateDepsWithLLM(
    deps: string[],
  ): Promise<{ dependencies: DependencyReport; screenshot?: string }> {
    const page = await this.browser.newPage();
    let screenshot: string | undefined;
    const depPages: string[] = [];

    try {
      for (const dep of deps) {
        try {
          const npmUrl = `https://www.npmjs.com/package/${encodeURIComponent(dep)}`;
          await page.goto(npmUrl, { waitUntil: 'networkidle2', timeout: 12000 });
          await this.browser.wait(1500);

          const content = await page.evaluate(() => {
            // Grab the full sidebar + header info
            return document.body.innerText.slice(0, 3000);
          });

          depPages.push(`### ${dep}\n${content}\n`);
        } catch {
          depPages.push(`### ${dep}\nFailed to load package page.\n`);
        }
      }

      // Screenshot the last package page
      try {
        screenshot = await this.browser.screenshot('dependency-check', page);
      } catch { /* ok */ }
    } finally {
      await page.close();
    }

    // Send to LLM for analysis
    const prompt = `
You are a dependency risk analyst. Evaluate these npm packages for a new TypeScript project.

## Packages to Evaluate
${depPages.join('\n')}

## Instructions
For each package, assess:
- Is it actively maintained? (check last publish date, weekly downloads)
- Is it deprecated or has known security issues?
- Does it have good TypeScript support?
- What's the risk level?

Respond with ONLY valid JSON (no markdown fences):
{
  "dependencies": [
    {
      "name": "package-name",
      "version": "latest version seen",
      "documentation": "excellent|good|poor|missing",
      "stability": "stable|experimental|deprecated",
      "risk": "low|medium|high",
      "notes": "brief risk note"
    }
  ],
  "overallRisk": "low|medium|high",
  "blockers": ["only list truly blocking issues"],
  "summary": "1-2 sentence overall assessment"
}
`;

    try {
      const result = await this.llm.execute({
        task: 'dependency-analysis',
        instructions: prompt,
        timeout: 30_000,
      });

      if (result.success && result.output) {
        const parsed = this.parseJSON<{
          dependencies?: Array<{
            name: string;
            version: string;
            documentation: string;
            stability: string;
            risk: string;
            notes?: string;
          }>;
          overallRisk?: string;
          blockers?: string[];
          summary?: string;
        }>(result.output);

        if (parsed?.dependencies) {
          if (parsed.summary) {
            logger.info(`Dep analysis: ${parsed.summary}`, undefined, ORACLE);
          }
          return {
            dependencies: {
              dependencies: parsed.dependencies.map((d) => ({
                name: d.name,
                version: d.version || 'unknown',
                documentation: (d.documentation as DependencyReport['dependencies'][0]['documentation']) || 'good',
                stability: (d.stability as DependencyReport['dependencies'][0]['stability']) || 'stable',
                lastUpdate: new Date(),
                risk: (d.risk as DependencyReport['dependencies'][0]['risk']) || 'low',
              })),
              overallRisk: (parsed.overallRisk as DependencyReport['overallRisk']) || 'low',
              blockers: parsed.blockers || [],
            },
            screenshot,
          };
        }
      }
    } catch (error) {
      logger.warn('LLM dep analysis failed, using fallback', error, ORACLE);
    }

    // Fallback
    return {
      dependencies: {
        dependencies: deps.map((d) => ({
          name: d,
          version: 'unknown',
          documentation: 'good' as const,
          stability: 'stable' as const,
          lastUpdate: new Date(),
          risk: 'low' as const,
        })),
        overallRisk: 'low',
        blockers: [],
      },
      screenshot,
    };
  }

  // ────────────────────────────────────────────────────────
  // Phase 3: Similar Project Deep-Dive (browse repos → LLM)
  // ────────────────────────────────────────────────────────

  private async researchSimilarProjects(idea: GeneratedIdea): Promise<{
    inspiration: InspirationSource[];
    implementationHints: ImplementationHints;
    screenshot?: string;
  }> {
    const page = await this.browser.newPage();
    const inspiration: InspirationSource[] = [];
    const repoContents: string[] = [];
    let screenshot: string | undefined;

    try {
      // Search for related repos
      const query = `${idea.name} ${idea.description.split(' ').slice(0, 4).join(' ')} TypeScript`;
      const searchUrl = `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories&s=stars&o=desc`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await this.browser.wait(3000);

      // Extract repo links from search results
      const repoLinks = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="results-list"] > div');
        return Array.from(items)
          .slice(0, 5)
          .map((el) => {
            const link = el.querySelector('a[href*="/"]') as HTMLAnchorElement | null;
            return {
              url: link?.href || '',
              title: link?.textContent?.trim() || '',
            };
          })
          .filter((r) => r.url.includes('github.com'));
      });

      // Deep-dive top 3 repos
      for (const repo of repoLinks.slice(0, 3)) {
        if (!repo.url) continue;
        try {
          // Visit the repo page
          await page.goto(repo.url, { waitUntil: 'networkidle2', timeout: 15000 });
          await this.browser.wait(2000);

          // Extract repo overview: file tree + README preview + about
          const repoOverview = await page.evaluate(() => {
            const about = document.querySelector('[class*="About"] p, .f4.my-3')?.textContent?.trim() || '';
            const topics = Array.from(document.querySelectorAll('[data-octo-click="topic_click"] a, .topic-tag'))
              .map((el) => el.textContent?.trim())
              .filter(Boolean)
              .join(', ');

            // File tree
            const rows = document.querySelectorAll(
              '[aria-labelledby*="file"] .react-directory-truncate, .js-navigation-open',
            );
            const files = Array.from(rows)
              .map((el) => el.textContent?.trim() || '')
              .filter(Boolean)
              .slice(0, 20);

            // README content (up to 4000 chars for LLM analysis)
            const readme = document.querySelector('article')?.innerText?.slice(0, 4000) || '';

            return { about, topics, files, readme };
          });

          const repoContent = [
            `## ${repo.title} (${repo.url})`,
            `About: ${repoOverview.about}`,
            `Topics: ${repoOverview.topics}`,
            `Files: ${repoOverview.files.join(', ')}`,
            `\nREADME (excerpt):\n${repoOverview.readme}`,
          ].join('\n');
          repoContents.push(repoContent);

          // Visit package.json for dependency insights
          try {
            const pkgUrl = repo.url.replace(/\/$/, '') + '/blob/main/package.json';
            await page.goto(pkgUrl, { waitUntil: 'networkidle2', timeout: 10000 });
            await this.browser.wait(1500);

            const pkgContent = await page.evaluate(() => {
              const code = document.querySelector(
                '[class*="code-content"], .blob-code-inner, pre, [data-testid="raw-content"]',
              );
              return code?.textContent?.trim().slice(0, 2000) || '';
            });

            if (pkgContent) {
              repoContents.push(`### ${repo.title} package.json\n${pkgContent}`);
            }
          } catch { /* no package.json */ }

          inspiration.push({
            url: repo.url,
            title: repo.title,
            type: 'github',
            relevance: 70,
            keyTakeaways: [],
          });
        } catch (error) {
          logger.debug(`Failed to deep-dive ${repo.title}`, error, ORACLE);
        }
      }

      // Screenshot the last repo visited
      try {
        screenshot = await this.browser.screenshot('similar-projects', page);
      } catch { /* ok */ }
    } finally {
      await page.close();
    }

    // Send all repo content to LLM for synthesis
    const hints = await this.analyseReposWithLLM(idea, repoContents, inspiration);

    return { inspiration, implementationHints: hints, screenshot };
  }

  /**
   * Use LLM to analyze browsed repo contents and extract implementation hints.
   */
  private async analyseReposWithLLM(
    idea: GeneratedIdea,
    repoContents: string[],
    inspiration: InspirationSource[],
  ): Promise<ImplementationHints> {
    const defaultHints: ImplementationHints = {
      architecturePatterns: [],
      fileStructure: [],
      commonDependencies: [],
      apiExamples: [],
    };

    if (repoContents.length === 0) return defaultHints;

    const prompt = `
You are a senior software architect. Analyse these similar GitHub repositories and extract useful implementation patterns for building a new project.

## New Project to Build
Name: ${idea.name}
Description: ${idea.description}
Core Features: ${idea.coreFeatures.map((f) => f.name).join(', ')}

## Similar Repositories Found
${repoContents.join('\n\n---\n\n')}

## Your Task
Extract practical implementation guidance. Focus on:
1. What architecture patterns do the similar projects use that we should adopt?
2. What file/folder structure works well?
3. What dependencies are commonly used that we should consider?
4. What API patterns or code examples could we learn from?
5. What are the key takeaways from each repo's README?

Respond with ONLY valid JSON (no markdown fences):
{
  "architecturePatterns": ["pattern 1 description", "pattern 2"],
  "fileStructure": ["recommended file/folder structure items"],
  "commonDependencies": ["dep1", "dep2"],
  "apiExamples": ["code pattern or API design insight"],
  "keyTakeawaysPerRepo": [
    {"repo": "repo-name", "takeaways": ["insight 1", "insight 2"]}
  ],
  "recommendedApproach": "2-3 sentences on how to best build this project based on what similar repos do"
}
`;

    try {
      const result = await this.llm.execute({
        task: 'implementation-analysis',
        instructions: prompt,
        timeout: 45_000,
      });

      if (result.success && result.output) {
        const parsed = this.parseJSON<{
          architecturePatterns?: string[];
          fileStructure?: string[];
          commonDependencies?: string[];
          apiExamples?: string[];
          keyTakeawaysPerRepo?: Array<{ repo: string; takeaways: string[] }>;
          recommendedApproach?: string;
        }>(result.output);

        if (parsed) {
          // Enrich inspiration sources with LLM-extracted takeaways
          if (parsed.keyTakeawaysPerRepo) {
            for (const rt of parsed.keyTakeawaysPerRepo) {
              const source = inspiration.find((s) =>
                s.title.toLowerCase().includes(rt.repo.toLowerCase())
                || rt.repo.toLowerCase().includes(s.title.toLowerCase()),
              );
              if (source) {
                source.keyTakeaways = rt.takeaways;
              }
            }
          }

          if (parsed.recommendedApproach) {
            logger.info(
              `LLM recommendation: ${parsed.recommendedApproach}`,
              undefined,
              ORACLE,
            );
          }

          return {
            architecturePatterns: parsed.architecturePatterns || [],
            fileStructure: parsed.fileStructure || [],
            commonDependencies: parsed.commonDependencies || [],
            apiExamples: parsed.apiExamples || [],
          };
        }
      }
    } catch (error) {
      logger.warn('LLM implementation analysis failed', error, ORACLE);
    }

    return defaultHints;
  }

  // ────────────────────────────────────────────────────────
  // Phase 4: Decision Synthesis (all findings → LLM)
  // ────────────────────────────────────────────────────────

  private async synthesiseDecision(
    idea: GeneratedIdea,
    existence: ExistenceCheck,
    deps: DependencyReport,
    inspiration: InspirationSource[],
    hints: ImplementationHints,
    risks: Risk[],
  ): Promise<{ recommendation: ResearchReport['recommendation']; confidence: number; reasoning: string }> {
    const prompt = `
You are a technical research advisor deciding whether a project idea should proceed to implementation.

## Proposed Project
Name: ${idea.name}
Description: ${idea.description}
Estimated hours: ${idea.estimatedHours}
Complexity: ${idea.complexity}
Dependencies: ${idea.dependencies.join(', ')}

## Research Findings

### Existence Check
Is novel: ${existence.isNovel}
Market gap: ${existence.marketGap}
Exact duplicates: ${existence.exactDuplicates.length}
Similar projects: ${JSON.stringify(existence.similarProjects.slice(0, 3))}

### Dependency Health
Overall risk: ${deps.overallRisk}
Blockers: ${deps.blockers.join(', ') || 'none'}
${deps.dependencies.map((d) => `- ${d.name}: ${d.stability}, risk ${d.risk}`).join('\n')}

### Similar Projects Found
${inspiration.map((s) => `- ${s.title}: ${s.keyTakeaways.join('; ') || 'no takeaways'}`).join('\n') || 'None found'}

### Implementation Hints
Architecture: ${hints.architecturePatterns.join(', ') || 'none'}
Common deps: ${hints.commonDependencies.join(', ') || 'none'}

### Identified Risks
${risks.map((r) => `- [${r.severity}] ${r.description}`).join('\n') || 'None'}

## Decision Options
- **SHIP**: Proceed to implementation. The idea is novel enough, dependencies are healthy, and risks are manageable.
- **PIVOT**: The core concept has potential but needs changes. Too many similar projects, risky deps, or scope issues.
- **ABORT**: Fundamental problems — exact duplicates exist, critical deps are broken, or it's not buildable.

Respond with ONLY valid JSON (no markdown fences):
{
  "recommendation": "SHIP|PIVOT|ABORT",
  "confidence": 0-100,
  "reasoning": "2-3 sentence explanation"
}
`;

    try {
      const result = await this.llm.execute({
        task: 'research-decision',
        instructions: prompt,
        timeout: 30_000,
      });

      if (result.success && result.output) {
        const parsed = this.parseJSON<{
          recommendation?: string;
          confidence?: number;
          reasoning?: string;
        }>(result.output);

        if (parsed?.recommendation) {
          const rec = parsed.recommendation.toUpperCase() as ResearchReport['recommendation'];
          if (['SHIP', 'PIVOT', 'ABORT'].includes(rec)) {
            return {
              recommendation: rec,
              confidence: Math.max(0, Math.min(100, parsed.confidence ?? 50)),
              reasoning: parsed.reasoning || 'LLM provided no reasoning',
            };
          }
        }
      }
    } catch (error) {
      logger.warn('LLM decision synthesis failed, using heuristic fallback', error, ORACLE);
    }

    // Fallback: rule-based decision
    return this.heuristicDecision(existence, deps, risks);
  }

  // ────────────────────────────────────────────────────────
  // Interface methods (kept for compatibility)
  // ────────────────────────────────────────────────────────

  async checkExistence(idea: GeneratedIdea): Promise<ExistenceCheck> {
    await this.browser.launch();
    try {
      const { existence } = await this.checkExistenceWithLLM(idea);
      return existence;
    } finally {
      await this.browser.close();
    }
  }

  async validateDependencies(deps: string[]): Promise<DependencyReport> {
    await this.browser.launch();
    try {
      const { dependencies } = await this.validateDepsWithLLM(deps);
      return dependencies;
    } finally {
      await this.browser.close();
    }
  }

  async findInspiration(keywords: string[]): Promise<InspirationSource[]> {
    const sources: InspirationSource[] = [];
    await this.browser.launch();
    const page = await this.browser.newPage();

    try {
      const query = keywords.slice(0, 3).join(' ') + ' TypeScript';
      const searchUrl = `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await this.browser.wait(2000);

      const repos = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="results-list"] > div');
        return Array.from(items)
          .slice(0, 5)
          .map((el) => {
            const link = el.querySelector('a[href*="/"]') as HTMLAnchorElement | null;
            return {
              url: link?.href || '',
              title: link?.textContent?.trim() || '',
            };
          })
          .filter((r) => r.url.includes('github.com'));
      });

      for (const repo of repos) {
        sources.push({
          url: repo.url,
          title: repo.title,
          type: 'github',
          relevance: 70,
          keyTakeaways: [],
        });
      }
    } catch (error) {
      logger.warn('Inspiration search failed', error, ORACLE);
    } finally {
      await page.close();
      await this.browser.close();
    }

    return sources;
  }

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  private heuristicDecision(
    existence: ExistenceCheck,
    deps: DependencyReport,
    risks: Risk[],
  ): { recommendation: ResearchReport['recommendation']; confidence: number; reasoning: string } {
    const blockers = risks.filter((r) => r.severity === 'blocker');
    const highRisks = risks.filter((r) => r.severity === 'high');

    if (blockers.length > 0) {
      return {
        recommendation: 'ABORT',
        confidence: 90,
        reasoning: `Blocker risks: ${blockers.map((r) => r.description).join('; ')}`,
      };
    }

    if (!existence.isNovel) {
      return {
        recommendation: 'PIVOT',
        confidence: 70,
        reasoning: 'Similar projects exist — need stronger differentiation',
      };
    }

    if (highRisks.length > 1 || deps.overallRisk === 'high') {
      return {
        recommendation: 'PIVOT',
        confidence: 65,
        reasoning: `Multiple high risks: ${highRisks.map((r) => r.description).join('; ')}`,
      };
    }

    const confidence = 85 - highRisks.length * 10;
    return {
      recommendation: 'SHIP',
      confidence: Math.max(50, confidence),
      reasoning: existence.isNovel
        ? 'Novel idea with manageable risks — ship it!'
        : 'Risks are acceptable, proceed with caution',
    };
  }

  private identifyRisks(idea: GeneratedIdea, deps: DependencyReport): Risk[] {
    const risks: Risk[] = [];

    if (idea.estimatedHours > 6) {
      risks.push({
        category: 'time',
        severity: 'medium',
        description: `Estimated ${idea.estimatedHours}h may exceed budget`,
        mitigation: 'Scope down to must-have features only',
      });
    }

    if (idea.complexity === 'complex') {
      risks.push({
        category: 'technical',
        severity: 'high',
        description: 'High complexity may lead to incomplete implementation',
        mitigation: 'Simplify architecture, use more "any" types',
      });
    }

    if (deps.overallRisk === 'medium' || deps.overallRisk === 'high') {
      risks.push({
        category: 'technical',
        severity: deps.overallRisk,
        description: `Dependency risk is ${deps.overallRisk}`,
        mitigation: 'Use well-known alternatives or remove risky deps',
      });
    }

    if (idea.coreFeatures.filter((f) => f.priority === 'must').length > 3) {
      risks.push({
        category: 'scope',
        severity: 'medium',
        description: 'Too many must-have features',
        mitigation: 'Demote some to "should" priority',
      });
    }

    return risks;
  }

  /**
   * Extract JSON from LLM output, handling common wrapping issues.
   */
  private parseJSON<T>(text: string): T | null {
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch { /* fall through */ }
      }

      // Try finding first { ... } or [ ... ]
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]);
        } catch { /* fall through */ }
      }

      logger.debug('Failed to parse JSON from LLM output', { text: text.slice(0, 200) }, ORACLE);
      return null;
    }
  }

  private buildReport(
    idea: GeneratedIdea,
    startTime: number,
    partial: {
      existence?: ExistenceCheck;
      dependencies?: DependencyReport;
      inspiration?: InspirationSource[];
      technicalRisks?: Risk[];
      screenshots: string[];
      recommendation: ResearchReport['recommendation'];
      confidence?: number;
      reasoning: string;
      implementationHints?: ImplementationHints;
    },
  ): ResearchReport {
    return {
      idea,
      timestamp: new Date(),
      existence: partial.existence || {
        exactDuplicates: [],
        similarProjects: [],
        npmPackages: [],
        isNovel: true,
        marketGap: 'Unknown',
      },
      dependencies: partial.dependencies || {
        dependencies: [],
        overallRisk: 'low',
        blockers: [],
      },
      inspiration: partial.inspiration || [],
      technicalRisks: partial.technicalRisks || [],
      recommendation: partial.recommendation,
      confidence: partial.confidence || 50,
      reasoning: partial.reasoning,
      screenshots: partial.screenshots,
      visitedUrls: this.browser.getVisitedUrls(),
      researchDuration: (Date.now() - startTime) / 1000,
      implementationHints: partial.implementationHints || {
        architecturePatterns: [],
        fileStructure: [],
        commonDependencies: [],
        apiExamples: [],
      },
    };
  }
}
