# AGENTS.md - Slopinator-9000 Oracle Architecture

This document defines the agent architecture for the Slopinator-9000 autonomous pipeline. Each oracle is a specialized agent with clear responsibilities, interfaces, and integration points with the Pi coding agent.

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                             │
│  (Manages state, coordinates oracles, handles failures)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │         EXECUTION PIPELINE             │
          └───────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Trend Scout  │───▶│     Idea     │───▶│  Research    │
│   Oracle     │    │  Generator   │    │   Master     │
└──────────────┘    │   Oracle     │    └──────────────┘
                    └──────────────┘           │
                                               ▼
                                      ┌──────────────┐
                    ┌─────────────────│ Pi Coding    │
                    │                 │   Agent      │
                    │                 └──────────────┘
                    │                        │
                    ▼                        ▼
          ┌──────────────┐          ┌──────────────┐
          │ Deployment   │◀─────────│Implementation│
          │ Specialist   │          │   Master     │
          └──────────────┘          └──────────────┘
                    │
                    ▼
          ┌──────────────┐
          │   Twitter    │
          │  Announcer   │
          └──────────────┘
```

---

## ORACLE SPECIFICATIONS

### 1. TREND SCOUT ORACLE

**Purpose:** Discover trending GitHub repositories with high idea potential

**Capabilities:**
- GitHub API integration
- Trending repo analysis
- Pattern recognition
- Idea surface detection

**Interface:**
```typescript
interface TrendScoutOracle {
  // Main entry point
  scoutTrends(options: ScoutOptions): Promise<TrendingRepo[]>;
  
  // Analyze single repo
  analyzeRepo(repoUrl: string): Promise<RepoAnalysis>;
  
  // Filter and rank repos
  rankByPotential(repos: TrendingRepo[]): TrendingRepo[];
}

interface ScoutOptions {
  period: 'daily' | 'weekly' | 'monthly';
  language?: string[];
  minStars?: number;
  maxAge?: number; // days
  topics?: string[];
}

interface TrendingRepo {
  url: string;
  name: string;
  owner: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  createdAt: Date;
  lastPush: Date;
  
  // Analysis
  ideaPotential: number; // 0-100
  complexity: 'simple' | 'moderate' | 'complex';
  ideaSurfaces: string[]; // What aspects could we riff on?
  reasoning: string;
}

interface RepoAnalysis {
  architecture: string; // What patterns does it use?
  dependencies: string[];
  communitySignals: {
    issuesCount: number;
    prsCount: number;
    contributorsCount: number;
    discussionActivity: 'low' | 'medium' | 'high';
  };
  technicalSignals: {
    testCoverage?: number;
    docsQuality: 'poor' | 'decent' | 'excellent';
    codeQuality: 'poor' | 'decent' | 'excellent';
  };
}
```

**Implementation Details:**

```typescript
class TrendScoutOracleImpl implements TrendScoutOracle {
  private github: GitHubClient;
  private cache: TrendCache;
  
  async scoutTrends(options: ScoutOptions): Promise<TrendingRepo[]> {
    // 1. Fetch from GitHub trending
    const trending = await this.github.getTrending(options.period);
    
    // 2. Apply filters
    let filtered = trending.filter(repo => {
      if (options.minStars && repo.stars < options.minStars) return false;
      if (options.language && !options.language.includes(repo.language)) return false;
      if (options.topics && !repo.topics.some(t => options.topics.includes(t))) return false;
      return true;
    });
    
    // 3. Analyze each repo
    const analyzed = await Promise.all(
      filtered.map(repo => this.analyzeRepo(repo.url))
    );
    
    // 4. Score by idea potential
    const scored = analyzed.map(analysis => ({
      ...analysis,
      ideaPotential: this.calculateIdeaPotential(analysis),
      ideaSurfaces: this.detectIdeaSurfaces(analysis),
      reasoning: this.explainScore(analysis)
    }));
    
    // 5. Rank and return top candidates
    return this.rankByPotential(scored).slice(0, 5);
  }
  
  private calculateIdeaPotential(repo: RepoAnalysis): number {
    let score = 50; // Base score
    
    // Boost for active community
    if (repo.communitySignals.discussionActivity === 'high') score += 20;
    
    // Boost for clear patterns we can riff on
    if (repo.architecture.includes('plugin')) score += 15;
    if (repo.architecture.includes('cli')) score += 10;
    
    // Penalty for over-complexity
    if (repo.complexity === 'complex') score -= 20;
    
    // Boost for TypeScript (our native tongue)
    if (repo.language === 'TypeScript') score += 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  private detectIdeaSurfaces(repo: RepoAnalysis): string[] {
    const surfaces: string[] = [];
    
    if (repo.architecture.includes('framework')) {
      surfaces.push('complementary-tool');
      surfaces.push('alternative-implementation');
    }
    
    if (repo.docsQuality === 'poor') {
      surfaces.push('docs-generator');
    }
    
    if (repo.hasAPI) {
      surfaces.push('api-wrapper');
      surfaces.push('sdk-generator');
    }
    
    return surfaces;
  }
}
```

**Time Budget:** 10-15 minutes per run

**Output:** 3-5 ranked repos with idea potential > 60

---

### 2. IDEA GENERATOR ORACLE

**Purpose:** Transform trending repos into adjacent, buildable ideas

**Capabilities:**
- Pattern recognition across domains
- Idea mutation strategies
- Creativity within constraints
- Scope estimation

**Interface:**
```typescript
interface IdeaGeneratorOracle {
  // Generate ideas from trending repo
  generateIdeas(repo: TrendingRepo): Promise<GeneratedIdea[]>;
  
  // Apply specific ideation strategy
  applyStrategy(repo: TrendingRepo, strategy: IdeaStrategy): Promise<GeneratedIdea>;
  
  // Validate idea feasibility
  validateIdea(idea: GeneratedIdea): Promise<IdeaValidation>;
}

type IdeaStrategy = 
  | 'adjacent'        // Same problem, different approach
  | 'complementary'   // Tool that enhances original
  | 'abstraction'     // Higher/lower level
  | 'inverse'         // Opposite philosophy
  | 'transfer'        // Same concept, different domain
  | 'niche'          // Ultra-specific use case

interface GeneratedIdea {
  name: string;
  tagline: string;
  description: string;
  tweetPitch: string; // Max 280 chars
  
  // Lineage
  originalRepo: string;
  strategy: IdeaStrategy;
  
  // Technical spec
  language: 'TypeScript';
  runtime: 'Node.js' | 'Browser' | 'Both';
  dependencies: string[];
  coreFeatures: Feature[];
  
  // Estimation
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedHours: number;
  slopFactor: number; // How scrappy can we be? 0-100
  
  // Success criteria
  mvpDefinition: string;
  successMetric: string;
}

interface Feature {
  name: string;
  description: string;
  priority: 'must' | 'should' | 'could';
  estimatedHours: number;
}

interface IdeaValidation {
  isNovel: boolean; // Not an exact duplicate
  isBuildable: boolean; // Technically feasible
  isInteresting: boolean; // Has hook/angle
  confidence: number; // 0-100
  concerns: string[];
  recommendations: string[];
}
```

**Implementation Details:**

```typescript
class IdeaGeneratorOracleImpl implements IdeaGeneratorOracle {
  private strategies: Map<IdeaStrategy, StrategyFunction>;
  
  constructor() {
    this.strategies = new Map([
      ['adjacent', this.adjacentStrategy.bind(this)],
      ['complementary', this.complementaryStrategy.bind(this)],
      ['abstraction', this.abstractionStrategy.bind(this)],
      ['inverse', this.inverseStrategy.bind(this)],
      ['transfer', this.transferStrategy.bind(this)],
      ['niche', this.nicheStrategy.bind(this)],
    ]);
  }
  
  async generateIdeas(repo: TrendingRepo): Promise<GeneratedIdea[]> {
    // Try multiple strategies in parallel
    const ideas = await Promise.all([
      this.applyStrategy(repo, 'adjacent'),
      this.applyStrategy(repo, 'complementary'),
      this.applyStrategy(repo, 'niche'),
    ]);
    
    // Validate and rank
    const validated = await Promise.all(
      ideas.map(idea => this.validateIdea(idea))
    );
    
    // Return only buildable, interesting ideas
    return ideas.filter((_, i) => 
      validated[i].isBuildable && 
      validated[i].isInteresting &&
      validated[i].confidence > 70
    );
  }
  
  private async adjacentStrategy(repo: TrendingRepo): Promise<GeneratedIdea> {
    // Example: Prisma → TypeORM alternative with better DX
    return {
      name: `${repo.name}-alt`,
      tagline: `${repo.description} but different`,
      strategy: 'adjacent',
      // ... rest of idea
    };
  }
  
  private async complementaryStrategy(repo: TrendingRepo): Promise<GeneratedIdea> {
    // Example: Next.js → Next.js deployment analyzer
    return {
      name: `${repo.name}-tools`,
      tagline: `Developer tools for ${repo.name}`,
      strategy: 'complementary',
      coreFeatures: [
        {
          name: 'Analyzer',
          description: `Analyze ${repo.name} projects`,
          priority: 'must',
          estimatedHours: 2
        },
        {
          name: 'Reporter',
          description: 'Generate insights report',
          priority: 'should',
          estimatedHours: 1.5
        }
      ],
      // ... rest
    };
  }
  
  private async nicheStrategy(repo: TrendingRepo): Promise<GeneratedIdea> {
    // Take broad tool, make it hyper-specific
    // Example: Supabase → Supabase for e-commerce analytics
    return {
      name: `${repo.name}-for-[niche]`,
      tagline: `${repo.description} optimized for [specific use case]`,
      strategy: 'niche',
      slopFactor: 80, // Can be very scrappy for niche tools
      // ... rest
    };
  }
}
```

**Ideation Prompts (for LLM-assisted generation):**

```typescript
const ideationPrompts = {
  adjacent: `
    Given this trending repo: {repo.name}
    Which solves: {repo.description}
    Using: {repo.language}
    
    Generate an ADJACENT idea that:
    - Solves the same problem differently
    - Uses different technical approach
    - Has clear differentiation angle
    - Can be built in 4-6 hours
    
    Output as JSON matching GeneratedIdea interface.
  `,
  
  complementary: `
    Given this trending repo: {repo.name}
    
    Generate a COMPLEMENTARY tool that:
    - Enhances or extends the original
    - Fills a gap in the ecosystem
    - Is useful to users of the original
    - Can be built in 3-5 hours
    
    Focus on developer tools, analyzers, or utilities.
  `,
  
  niche: `
    Given this broad tool: {repo.name}
    
    Generate a NICHE version that:
    - Targets ultra-specific use case
    - Removes unnecessary features
    - Optimizes for that one thing
    - Can be built in 2-4 hours
    
    Example niches: e-commerce, SaaS analytics, gaming, content creators
  `
};
```

**Time Budget:** 15-20 minutes per repo

**Output:** 1-3 validated ideas ready for research

---

### 3. RESEARCH MASTER ORACLE

**Purpose:** Validate idea feasibility using headful browser automation

**Capabilities:**
- Chrome DevTools Protocol (CDP)
- Headful browser automation
- Documentation parsing
- Competitive analysis
- Technical validation

**Interface:**
```typescript
interface ResearchMasterOracle {
  // Main research workflow
  research(idea: GeneratedIdea): Promise<ResearchReport>;
  
  // Individual research tasks
  checkExistence(idea: GeneratedIdea): Promise<ExistenceCheck>;
  validateDependencies(deps: string[]): Promise<DependencyReport>;
  findInspiration(keywords: string[]): Promise<InspirationSource[]>;
  estimateEffort(idea: GeneratedIdea): Promise<EffortEstimate>;
}

interface ResearchReport {
  idea: GeneratedIdea;
  timestamp: Date;
  
  // Findings
  existence: ExistenceCheck;
  dependencies: DependencyReport;
  inspiration: InspirationSource[];
  technicalRisks: Risk[];
  
  // Decision
  recommendation: 'SHIP' | 'PIVOT' | 'ABORT';
  confidence: number; // 0-100
  reasoning: string;
  
  // Evidence
  screenshots: string[]; // Paths to screenshots
  visitedUrls: string[];
  researchDuration: number; // seconds
}

interface ExistenceCheck {
  exactDuplicates: GitHubRepo[];
  similarProjects: GitHubRepo[];
  npmPackages: NpmPackage[];
  isNovel: boolean;
  marketGap: string;
}

interface DependencyReport {
  dependencies: Array<{
    name: string;
    version: string;
    documentation: 'excellent' | 'good' | 'poor' | 'missing';
    stability: 'stable' | 'experimental' | 'deprecated';
    lastUpdate: Date;
    risk: 'low' | 'medium' | 'high';
  }>;
  overallRisk: 'low' | 'medium' | 'high';
  blockers: string[];
}

interface InspirationSource {
  url: string;
  title: string;
  type: 'github' | 'article' | 'docs' | 'tutorial';
  relevance: number; // 0-100
  keyTakeaways: string[];
  screenshotPath?: string;
}

interface Risk {
  category: 'technical' | 'market' | 'time' | 'scope';
  severity: 'low' | 'medium' | 'high' | 'blocker';
  description: string;
  mitigation?: string;
}
```

**Implementation Details:**

```typescript
class ResearchMasterOracleImpl implements ResearchMasterOracle {
  private browser: ChromeBrowser; // CDP connection
  private logger: Logger;
  
  async research(idea: GeneratedIdea): Promise<ResearchReport> {
    const startTime = Date.now();
    const screenshots: string[] = [];
    const visitedUrls: string[] = [];
    
    // Launch headful Chrome
    await this.browser.launch({
      headless: false,
      slowMo: 100, // Visible automation
      devtools: true,
      args: ['--window-size=1920,1080']
    });
    
    try {
      // 1. Check if it already exists
      this.logger.info('Checking for existing projects...');
      const existence = await this.checkExistence(idea);
      screenshots.push(await this.browser.screenshot('existence-check'));
      visitedUrls.push(...this.browser.getVisitedUrls());
      
      if (existence.exactDuplicates.length > 0) {
        return {
          recommendation: 'ABORT',
          reasoning: `Exact duplicate found: ${existence.exactDuplicates[0].url}`,
          // ... rest
        };
      }
      
      // 2. Validate dependencies
      this.logger.info('Validating dependencies...');
      const dependencies = await this.validateDependencies(idea.dependencies);
      screenshots.push(await this.browser.screenshot('dependency-check'));
      
      if (dependencies.overallRisk === 'high' || dependencies.blockers.length > 0) {
        return {
          recommendation: 'PIVOT',
          reasoning: `Dependency risks: ${dependencies.blockers.join(', ')}`,
          // ... rest
        };
      }
      
      // 3. Find inspiration and prior art
      this.logger.info('Finding inspiration...');
      const inspiration = await this.findInspiration([
        idea.name,
        ...idea.description.split(' ').filter(w => w.length > 5)
      ]);
      
      // Take screenshots of top 3 inspirations
      for (const source of inspiration.slice(0, 3)) {
        await this.browser.navigate(source.url);
        await this.browser.wait(2000);
        screenshots.push(await this.browser.screenshot(`inspiration-${source.title}`));
      }
      
      // 4. Estimate effort
      this.logger.info('Estimating effort...');
      const effort = await this.estimateEffort(idea);
      
      // 5. Identify risks
      const risks = this.identifyRisks(idea, dependencies, effort);
      
      // 6. Make recommendation
      const recommendation = this.makeRecommendation(
        existence,
        dependencies,
        risks,
        effort
      );
      
      return {
        idea,
        timestamp: new Date(),
        existence,
        dependencies,
        inspiration,
        technicalRisks: risks,
        recommendation,
        confidence: this.calculateConfidence(risks, dependencies),
        reasoning: this.explainRecommendation(recommendation, risks),
        screenshots,
        visitedUrls,
        researchDuration: (Date.now() - startTime) / 1000
      };
      
    } finally {
      await this.browser.close();
    }
  }
  
  private async checkExistence(idea: GeneratedIdea): Promise<ExistenceCheck> {
    const page = await this.browser.newPage();
    
    // Search GitHub
    await page.navigate('https://github.com/search');
    await page.type('input[name="q"]', `${idea.name} language:TypeScript`);
    await page.press('Enter');
    await page.waitForNavigation();
    
    const githubRepos = await page.evaluate(() => {
      const results = document.querySelectorAll('.repo-list-item');
      return Array.from(results).map(el => ({
        name: el.querySelector('a')?.textContent,
        url: el.querySelector('a')?.href,
        description: el.querySelector('.mb-1')?.textContent,
        stars: parseInt(el.querySelector('.muted-link')?.textContent || '0')
      }));
    });
    
    // Search NPM
    await page.navigate(`https://www.npmjs.com/search?q=${idea.name}`);
    await page.waitForSelector('.search-results');
    
    const npmPackages = await page.evaluate(() => {
      // Extract NPM search results
      const results = document.querySelectorAll('.package-list-item');
      return Array.from(results).map(el => ({
        name: el.querySelector('h3')?.textContent,
        description: el.querySelector('p')?.textContent,
        downloads: el.querySelector('.downloads')?.textContent
      }));
    });
    
    // Determine novelty
    const exactDuplicates = githubRepos.filter(repo => 
      repo.name.toLowerCase() === idea.name.toLowerCase() &&
      repo.stars > 50
    );
    
    const isNovel = exactDuplicates.length === 0 && npmPackages.length < 3;
    
    return {
      exactDuplicates,
      similarProjects: githubRepos.filter(r => !exactDuplicates.includes(r)),
      npmPackages,
      isNovel,
      marketGap: isNovel ? 
        'Clear gap - no exact duplicates found' :
        'Crowded space - differentiation required'
    };
  }
  
  private async validateDependencies(deps: string[]): Promise<DependencyReport> {
    const page = await this.browser.newPage();
    const depReports = [];
    
    for (const dep of deps) {
      // Visit NPM package page
      await page.navigate(`https://www.npmjs.com/package/${dep}`);
      await page.waitForSelector('.package-page');
      
      const depInfo = await page.evaluate(() => ({
        version: document.querySelector('.version')?.textContent,
        lastUpdate: document.querySelector('.last-update')?.textContent,
        weeklyDownloads: document.querySelector('.downloads')?.textContent,
        hasTypes: !!document.querySelector('.types-badge'),
        deprecated: !!document.querySelector('.deprecated-badge')
      }));
      
      // Check documentation
      const docsQuality = await this.checkDocs(dep);
      
      depReports.push({
        name: dep,
        version: depInfo.version,
        documentation: docsQuality,
        stability: depInfo.deprecated ? 'deprecated' : 'stable',
        lastUpdate: new Date(depInfo.lastUpdate),
        risk: this.assessDepRisk(depInfo, docsQuality)
      });
    }
    
    const overallRisk = this.calculateOverallRisk(depReports);
    const blockers = depReports
      .filter(d => d.risk === 'high')
      .map(d => `${d.name}: ${d.stability}`);
    
    return {
      dependencies: depReports,
      overallRisk,
      blockers
    };
  }
  
  private async findInspiration(keywords: string[]): Promise<InspirationSource[]> {
    const sources: InspirationSource[] = [];
    const page = await this.browser.newPage();
    
    // Search GitHub for similar projects
    const query = keywords.join(' ') + ' language:TypeScript';
    await page.navigate(`https://github.com/search?q=${encodeURIComponent(query)}`);
    await page.waitForSelector('.repo-list');
    
    const repos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.repo-list-item'))
        .slice(0, 5)
        .map(el => ({
          url: el.querySelector('a')?.href,
          title: el.querySelector('a')?.textContent?.trim(),
          description: el.querySelector('.mb-1')?.textContent?.trim()
        }));
    });
    
    for (const repo of repos) {
      sources.push({
        url: repo.url,
        title: repo.title,
        type: 'github',
        relevance: this.calculateRelevance(repo.description, keywords),
        keyTakeaways: [] // Filled by analyzing README
      });
    }
    
    // Search HackerNews for discussions
    await page.navigate(`https://hn.algolia.com/?q=${keywords[0]}`);
    // ... extract HN posts
    
    return sources.sort((a, b) => b.relevance - a.relevance);
  }
}
```

**Browser Automation Best Practices:**

```typescript
// Headful Chrome Configuration
const browserConfig = {
  headless: false, // ALWAYS visible
  slowMo: 100, // Slow down for human visibility
  devtools: true, // Auto-open DevTools
  defaultViewport: {
    width: 1920,
    height: 1080
  },
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  ]
};

// Screenshot everything
async function researchStep(name: string, action: () => Promise<void>) {
  logger.info(`Starting: ${name}`);
  await action();
  await browser.screenshot(`research/${name}-${Date.now()}.png`);
  logger.info(`Completed: ${name}`);
}

// Respect rate limits
const delays = {
  betweenRequests: 1000, // 1 second
  betweenPages: 2000, // 2 seconds
  afterError: 5000 // 5 seconds
};
```

**Time Budget:** 20-30 minutes per idea

**Output:** Comprehensive research report with SHIP/PIVOT/ABORT recommendation

---

### 4. IMPLEMENTATION MASTER ORACLE

**Purpose:** Coordinate with Pi coding agent to build the project

**Capabilities:**
- Pi agent orchestration
- Task decomposition
- Progress monitoring
- Quality gates
- Failure recovery

**Interface:**
```typescript
interface ImplementationMasterOracle {
  // Main implementation workflow
  implement(idea: GeneratedIdea, research: ResearchReport): Promise<ImplementationResult>;
  
  // Pi agent coordination
  initializeProject(idea: GeneratedIdea): Promise<ProjectSetup>;
  buildCore(features: Feature[]): Promise<BuildResult>;
  createExamples(): Promise<ExampleResult>;
  runTests(): Promise<TestResult>;
  
  // Monitoring and recovery
  monitorProgress(): AsyncIterator<ProgressUpdate>;
  handleFailure(error: BuildError): Promise<RecoveryAction>;
}

interface ProjectSetup {
  repoPath: string;
  packageJson: object;
  tsConfig: object;
  initialized: boolean;
  errors: string[];
}

interface BuildResult {
  success: boolean;
  filesCreated: string[];
  linesOfCode: number;
  timeSpent: number; // seconds
  errors: BuildError[];
  warnings: string[];
}

interface BuildError {
  type: 'syntax' | 'type' | 'runtime' | 'dependency';
  file: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface ImplementationResult {
  status: 'complete' | 'partial' | 'failed';
  repoPath: string;
  buildArtifacts: string[];
  coreFeatures: Array<{
    feature: Feature;
    implemented: boolean;
    filesModified: string[];
  }>;
  examplesCreated: string[];
  testsPass: boolean;
  readmeExists: boolean;
  
  // Metrics
  totalHours: number;
  linesOfCode: number;
  filesCreated: number;
  
  // Issues
  issues: BuildError[];
  technicalDebt: string[];
  todoItems: string[];
}
```

**Implementation Details:**

```typescript
class ImplementationMasterOracleImpl implements ImplementationMasterOracle {
  private pi: PiCodingAgent;
  private logger: Logger;
  private workspace: string = '/tmp/slopinator-9000-workspace';
  
  async implement(
    idea: GeneratedIdea, 
    research: ResearchReport
  ): Promise<ImplementationResult> {
    const startTime = Date.now();
    
    try {
      // 1. Initialize project structure
      this.logger.info('Initializing project...');
      const setup = await this.initializeProject(idea);
      
      if (!setup.initialized) {
        throw new Error(`Setup failed: ${setup.errors.join(', ')}`);
      }
      
      // 2. Implement core features (one at a time)
      this.logger.info('Building core features...');
      const coreResults = [];
      
      for (const feature of idea.coreFeatures.filter(f => f.priority === 'must')) {
        this.logger.info(`Implementing: ${feature.name}`);
        
        const result = await this.pi.execute({
          task: 'implement-feature',
          context: {
            projectPath: setup.repoPath,
            feature,
            idea,
            research: research.inspiration
          },
          timeLimit: feature.estimatedHours * 3600, // seconds
          instructions: this.generateFeaturePrompt(feature, idea)
        });
        
        coreResults.push({
          feature,
          implemented: result.success,
          filesModified: result.filesModified
        });
        
        // Stop if critical feature fails
        if (!result.success && feature.priority === 'must') {
          return this.handleCriticalFailure(feature, result);
        }
      }
      
      // 3. Create examples
      this.logger.info('Creating examples...');
      const examples = await this.createExamples();
      
      // 4. Generate README
      this.logger.info('Generating README...');
      await this.pi.execute({
        task: 'create-readme',
        context: { idea, coreResults, examples },
        instructions: this.generateReadmePrompt(idea)
      });
      
      // 5. Run tests (if any)
      this.logger.info('Running tests...');
      const testResult = await this.runTests();
      
      // 6. Compile results
      return {
        status: this.determineStatus(coreResults, testResult),
        repoPath: setup.repoPath,
        buildArtifacts: await this.collectArtifacts(setup.repoPath),
        coreFeatures: coreResults,
        examplesCreated: examples.files,
        testsPass: testResult.passed,
        readmeExists: await this.fileExists(setup.repoPath, 'README.md'),
        totalHours: (Date.now() - startTime) / 3600000,
        linesOfCode: await this.countLOC(setup.repoPath),
        filesCreated: await this.countFiles(setup.repoPath),
        issues: testResult.errors,
        technicalDebt: this.identifyDebt(coreResults),
        todoItems: this.extractTodos(setup.repoPath)
      };
      
    } catch (error) {
      this.logger.error('Implementation failed:', error);
      return this.createFailureResult(error);
    }
  }
  
  private generateFeaturePrompt(feature: Feature, idea: GeneratedIdea): string {
    return `
# Implement Feature: ${feature.name}

## Context
Project: ${idea.name}
Description: ${idea.description}

## Feature Requirements
${feature.description}

## Instructions
1. Create necessary files in the project structure
2. Implement the core logic with these priorities:
   - Working code > elegant code
   - Happy path first, error handling later
   - Use dependencies from package.json
   - Add minimal comments only where needed

3. Time budget: ${feature.estimatedHours} hours MAX
   - If stuck for >15 minutes, try simpler approach
   - If can't complete in time, implement partial version

4. Verification:
   - Code should run without errors
   - Basic functionality should work
   - Add simple test if time permits

## Slop Factor: ${idea.slopFactor}/100
- High slop factor means: be scrappy, ship fast, iterate later
- Low slop factor means: a bit more polish, but still ship fast

## Output
Provide:
- List of files created/modified
- Brief explanation of implementation
- Any shortcuts taken or technical debt introduced
    `.trim();
  }
  
  async initializeProject(idea: GeneratedIdea): Promise<ProjectSetup> {
    const projectName = idea.name.toLowerCase().replace(/\s+/g, '-');
    const repoPath = `${this.workspace}/${projectName}`;
    
    const result = await this.pi.execute({
      task: 'init-project',
      instructions: `
        Create a new TypeScript project at ${repoPath}:
        
        1. Initialize: npm init -y
        2. Install dev dependencies:
           - typescript
           - tsup (for building)
           - vitest (for testing)
           - @types/node
        
        3. Install dependencies: ${idea.dependencies.join(', ')}
        
        4. Create tsconfig.json with strict mode
        5. Create basic file structure:
           - src/index.ts (entry point)
           - src/types.ts (types)
           - examples/ (usage examples)
           - tests/ (tests)
        
        6. Setup package.json scripts:
           - build: tsup src/index.ts --dts
           - test: vitest
           - dev: tsup src/index.ts --watch
        
        7. Initialize git repo
        8. Create .gitignore
      `
    });
    
    return {
      repoPath,
      packageJson: require(`${repoPath}/package.json`),
      tsConfig: require(`${repoPath}/tsconfig.json`),
      initialized: result.success,
      errors: result.errors || []
    };
  }
  
  async buildCore(features: Feature[]): Promise<BuildResult> {
    // Implemented above in implement()
    throw new Error('Method not used - see implement()');
  }
  
  async createExamples(): Promise<ExampleResult> {
    const result = await this.pi.execute({
      task: 'create-examples',
      instructions: `
        Create 1-2 simple, runnable examples in /examples directory:
        
        1. basic.ts - Shows core functionality
        2. advanced.ts - Shows additional features (optional)
        
        Each example should:
        - Be copy-pasteable and runnable
        - Have comments explaining each step
        - Show realistic use case
        - Be < 50 lines of code
        
        Use:
        - import from '../src'
        - Real-world use cases
        - Clear variable names
        - Minimal dependencies
      `
    });
    
    return {
      success: result.success,
      files: result.filesCreated,
      errors: result.errors
    };
  }
  
  async runTests(): Promise<TestResult> {
    const result = await this.pi.execute({
      task: 'run-tests',
      command: 'npm test',
      timeout: 60000 // 1 minute max
    });
    
    return {
      passed: result.exitCode === 0,
      testCount: result.testCount || 0,
      duration: result.duration,
      errors: result.errors || []
    };
  }
  
  private async handleCriticalFailure(
    feature: Feature, 
    result: BuildResult
  ): Promise<ImplementationResult> {
    this.logger.error(`Critical feature failed: ${feature.name}`);
    
    // Try one recovery attempt
    const recovery = await this.handleFailure({
      type: 'runtime',
      file: 'unknown',
      message: result.errors.join('; '),
      severity: 'error'
    });
    
    if (recovery.action === 'retry') {
      // Simplified version
      return this.implement(/* simplified version */);
    }
    
    return {
      status: 'failed',
      // ... failure details
    };
  }
  
  async handleFailure(error: BuildError): Promise<RecoveryAction> {
    // Simple recovery strategies
    if (error.type === 'dependency') {
      return { action: 'install-dependency', details: error.message };
    }
    
    if (error.type === 'syntax') {
      return { action: 'retry', details: 'Fix syntax and retry' };
    }
    
    if (error.type === 'type') {
      return { action: 'add-any-types', details: 'Use any for now' };
    }
    
    return { action: 'scope-down', details: 'Simplify feature' };
  }
}
```

**Pi Agent Integration:**

```typescript
// Pi agent wrapper for Slopinator-9000
class PiCodingAgent {
  private piPath: string;
  
  async execute(task: PiTask): Promise<PiResult> {
    // Call Pi agent with task
    const command = `pi ${task.task} --context '${JSON.stringify(task.context)}'`;
    
    // Stream output for visibility
    const process = spawn(command, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    process.stdout.on('data', (data) => {
      console.log(`[Pi] ${data}`);
    });
    
    return new Promise((resolve) => {
      process.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code,
          // ... parse Pi output
        });
      });
    });
  }
}

interface PiTask {
  task: string;
  context?: any;
  instructions?: string;
  timeLimit?: number;
  command?: string;
  timeout?: number;
}

interface PiResult {
  success: boolean;
  exitCode: number;
  filesCreated?: string[];
  filesModified?: string[];
  errors?: BuildError[];
  duration?: number;
  output?: string;
}
```

**Time Budget:** 4-8 hours (enforced by timeouts)

**Output:** Working project with core features implemented

---

### 5. DEPLOYMENT SPECIALIST ORACLE

**Purpose:** Prepare and deploy project to GitHub (and optionally NPM)

**Capabilities:**
- Git operations
- GitHub repository creation
- NPM publishing
- README finalization
- Release automation

**Interface:**
```typescript
interface DeploymentSpecialistOracle {
  // Main deployment workflow
  deploy(implementation: ImplementationResult, idea: GeneratedIdea): Promise<DeploymentResult>;
  
  // Individual deployment tasks
  createGitHubRepo(name: string, description: string): Promise<GitHubRepo>;
  finalizeReadme(repoPath: string, idea: GeneratedIdea): Promise<void>;
  commitAndPush(repoPath: string): Promise<void>;
  publishToNPM(repoPath: string): Promise<NpmPublishResult>;
}

interface DeploymentResult {
  success: boolean;
  repoUrl: string;
  npmUrl?: string;
  releaseTag: string;
  deployedAt: Date;
  
  // Metadata
  initialCommit: string;
  filesDeployed: number;
  badges: string[];
  
  // Issues
  warnings: string[];
  errors: string[];
}

interface GitHubRepo {
  url: string;
  name: string;
  owner: string;
  fullName: string;
  cloneUrl: string;
}

interface NpmPublishResult {
  success: boolean;
  packageName: string;
  version: string;
  url: string;
  errors?: string[];
}
```

**Implementation Details:**

```typescript
class DeploymentSpecialistOracleImpl implements DeploymentSpecialistOracle {
  private github: GitHubClient;
  private npm: NpmClient;
  private git: GitClient;
  
  async deploy(
    implementation: ImplementationResult,
    idea: GeneratedIdea
  ): Promise<DeploymentResult> {
    const { repoPath } = implementation;
    
    try {
      // 1. Create GitHub repository
      this.logger.info('Creating GitHub repo...');
      const repo = await this.createGitHubRepo(
        idea.name,
        idea.tagline
      );
      
      // 2. Finalize README with repo URL
      this.logger.info('Finalizing README...');
      await this.finalizeReadme(repoPath, idea, repo);
      
      // 3. Add standard files
      await this.ensureStandardFiles(repoPath, idea);
      
      // 4. Commit everything
      this.logger.info('Committing...');
      await this.git.add(repoPath, '.');
      await this.git.commit(
        repoPath,
        'feat: initial commit - velocity coding at its finest 🚀'
      );
      
      // 5. Tag version
      await this.git.tag(repoPath, 'v0.1.0');
      
      // 6. Push to GitHub
      this.logger.info('Pushing to GitHub...');
      await this.git.addRemote(repoPath, 'origin', repo.cloneUrl);
      await this.git.push(repoPath, 'origin', 'main');
      await this.git.pushTags(repoPath);
      
      // 7. Publish to NPM (optional)
      let npmResult;
      if (idea.publishToNpm !== false) {
        this.logger.info('Publishing to NPM...');
        npmResult = await this.publishToNPM(repoPath);
      }
      
      return {
        success: true,
        repoUrl: repo.url,
        npmUrl: npmResult?.url,
        releaseTag: 'v0.1.0',
        deployedAt: new Date(),
        initialCommit: await this.git.getLastCommit(repoPath),
        filesDeployed: implementation.filesCreated,
        badges: this.generateBadges(repo, npmResult),
        warnings: [],
        errors: []
      };
      
    } catch (error) {
      this.logger.error('Deployment failed:', error);
      return {
        success: false,
        errors: [error.message],
        // ... error details
      };
    }
  }
  
  async createGitHubRepo(name: string, description: string): Promise<GitHubRepo> {
    const response = await this.github.repos.create({
      name,
      description,
      private: false,
      auto_init: false,
      has_issues: true,
      has_wiki: false,
      topics: [
        'slopinator-9000',
        'velocity-coding',
        'ai-generated',
        'typescript'
      ]
    });
    
    return {
      url: response.data.html_url,
      name: response.data.name,
      owner: response.data.owner.login,
      fullName: response.data.full_name,
      cloneUrl: response.data.clone_url
    };
  }
  
  async finalizeReadme(
    repoPath: string,
    idea: GeneratedIdea,
    repo: GitHubRepo
  ): Promise<void> {
    const readmePath = `${repoPath}/README.md`;
    let readme = await fs.readFile(readmePath, 'utf-8');
    
    // Add badges
    const badges = [
      `![Version](https://img.shields.io/badge/version-0.1.0-blue)`,
      `![License](https://img.shields.io/badge/license-MIT-green)`,
      `![Velocity](https://img.shields.io/badge/velocity-ludicrous-ff69b4)`,
    ];
    
    readme = `${badges.join(' ')}\n\n${readme}`;
    
    // Add meta section
    readme += `\n\n## Meta\n\n`;
    readme += `This project was built by [Slopinator-9000](https://github.com/slopinator-9000/slopinator-9000) - `;
    readme += `an autonomous pipeline that goes from trending repos to deployed projects.\n\n`;
    readme += `**Inspiration:** [${idea.originalRepo}](https://github.com/${idea.originalRepo})\n`;
    readme += `**Strategy:** ${idea.strategy}\n`;
    readme += `**Time to ship:** ${implementation.totalHours.toFixed(1)} hours\n\n`;
    readme += `### The Slop Disclaimer\n\n`;
    readme += `This was built prioritizing velocity over perfection:\n`;
    readme += `- ✅ It works (mostly)\n`;
    readme += `- 🤷 It's not perfect\n`;
    readme += `- 🚀 It shipped fast\n`;
    readme += `- 🔧 PRs welcome\n\n`;
    readme += `**License:** MIT\n`;
    
    await fs.writeFile(readmePath, readme);
  }
  
  async ensureStandardFiles(repoPath: string, idea: GeneratedIdea): Promise<void> {
    // LICENSE
    await fs.writeFile(`${repoPath}/LICENSE`, this.generateMITLicense());
    
    // CHANGELOG.md
    await fs.writeFile(`${repoPath}/CHANGELOG.md`, `# Changelog\n\n## v0.1.0 (${new Date().toISOString().split('T')[0]})\n\n- Initial release 🚀\n- Core features implemented\n- Examples added\n`);
    
    // .gitignore (if missing)
    if (!await this.fileExists(`${repoPath}/.gitignore`)) {
      await fs.writeFile(`${repoPath}/.gitignore`, this.getNodeGitignore());
    }
    
    // .github/workflows/ci.yml (optional, simple)
    await this.createSimpleCI(repoPath);
  }
  
  async publishToNPM(repoPath: string): Promise<NpmPublishResult> {
    try {
      // Ensure package.json has required fields
      const pkg = require(`${repoPath}/package.json`);
      
      if (!pkg.name || !pkg.version) {
        throw new Error('Missing name or version in package.json');
      }
      
      // Build first
      await this.npm.run(repoPath, 'build');
      
      // Publish
      await this.npm.publish(repoPath, {
        access: 'public'
      });
      
      return {
        success: true,
        packageName: pkg.name,
        version: pkg.version,
        url: `https://www.npmjs.com/package/${pkg.name}`
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}
```

**Time Budget:** 15-20 minutes

**Output:** Public GitHub repo with proper metadata and documentation

---

### 6. TWITTER ANNOUNCER ORACLE

**Purpose:** Announce the project on Twitter with appropriate energy

**Capabilities:**
- Tweet composition
- Style selection
- Thread creation
- Link shortening
- Engagement tracking

**Interface:**
```typescript
interface TwitterAnnouncerOracle {
  // Main announcement
  announce(
    deployment: DeploymentResult,
    idea: GeneratedIdea,
    implementation: ImplementationResult
  ): Promise<TweetResult>;
  
  // Tweet generation
  composeTweet(style: TweetStyle): Promise<Tweet>;
  createThread(tweet: Tweet): Promise<Thread>;
  
  // Utilities
  selectStyle(idea: GeneratedIdea): TweetStyle;
  validateTweet(tweet: Tweet): boolean;
}

type TweetStyle = 'honest' | 'meme' | 'technical' | 'chaotic';

interface Tweet {
  text: string;
  style: TweetStyle;
  metadata: {
    githubUrl: string;
    npmUrl?: string;
    hashtags: string[];
    mentions: string[];
  };
}

interface Thread {
  tweets: Tweet[];
  totalLength: number;
}

interface TweetResult {
  success: boolean;
  tweetUrl?: string;
  tweetId?: string;
  timestamp: Date;
  engagement?: {
    likes: number;
    retweets: number;
    replies: number;
  };
}
```

**Implementation Details:**

```typescript
class TwitterAnnouncerOracleImpl implements TwitterAnnouncerOracle {
  private twitter: TwitterClient;
  
  async announce(
    deployment: DeploymentResult,
    idea: GeneratedIdea,
    implementation: ImplementationResult
  ): Promise<TweetResult> {
    // 1. Select style based on context
    const style = this.selectStyle(idea);
    
    // 2. Compose tweet
    const tweet = await this.composeTweet(style, {
      name: idea.name,
      description: idea.tagline,
      githubUrl: deployment.repoUrl,
      npmUrl: deployment.npmUrl,
      hours: implementation.totalHours,
      originalRepo: idea.originalRepo,
      strategy: idea.strategy
    });
    
    // 3. Validate (length, links, etc.)
    if (!this.validateTweet(tweet)) {
      throw new Error('Tweet validation failed');
    }
    
    // 4. Post to Twitter
    try {
      const result = await this.twitter.post(tweet.text);
      
      return {
        success: true,
        tweetUrl: `https://twitter.com/${result.user}/status/${result.id}`,
        tweetId: result.id,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Tweet failed:', error);
      return {
        success: false,
        timestamp: new Date()
      };
    }
  }
  
  selectStyle(idea: GeneratedIdea): TweetStyle {
    // Time-based selection
    const hour = new Date().getHours();
    
    // Late night = chaotic energy
    if (hour >= 23 || hour < 6) return 'chaotic';
    
    // Complexity-based
    if (idea.slopFactor > 80) return 'meme';
    if (idea.complexity === 'complex') return 'technical';
    
    // Default to honest
    return Math.random() > 0.7 ? 'technical' : 'honest';
  }
  
  async composeTweet(style: TweetStyle, data: any): Promise<Tweet> {
    const templates = {
      honest: this.honestTemplate,
      meme: this.memeTemplate,
      technical: this.technicalTemplate,
      chaotic: this.chaoticTemplate
    };
    
    const text = templates[style](data);
    
    return {
      text: this.ensureLength(text, 280),
      style,
      metadata: {
        githubUrl: data.githubUrl,
        npmUrl: data.npmUrl,
        hashtags: ['BuildInPublic', 'VelocityCoding'],
        mentions: []
      }
    };
  }
  
  private honestTemplate(data: any): string {
    return `Just shipped ${data.name} in ${data.hours.toFixed(1)} hours 🚀

${data.description}

Built by an autonomous agent pipeline. It works, mostly.

${data.githubUrl}

#BuildInPublic #VelocityCoding`;
  }
  
  private memeTemplate(data: any): string {
    return `POV: You gave an AI agent access to GitHub trending and told it to ship

Result: ${data.name} ✨

${data.description}

${data.githubUrl}

Is this progress? Who knows. But it's shipped.`;
  }
  
  private technicalTemplate(data: any): string {
    return `New project: ${data.name}

Inspired by ${data.originalRepo}, but ${this.explainDifference(data.strategy)}

Built in ${data.hours.toFixed(1)}h
Status: It runs™️

${data.githubUrl}`;
  }
  
  private chaoticTemplate(data: any): string {
    return `i told an AI to build something inspired by trending repos

it made ${data.name}

is it good? idk
does it work? mostly
should you use it? probably not

but it's shipped and that's what matters

${data.githubUrl}`;
  }
  
  private ensureLength(text: string, max: number): string {
    if (text.length <= max) return text;
    
    // Truncate and add ellipsis
    return text.substring(0, max - 3) + '...';
  }
  
  validateTweet(tweet: Tweet): boolean {
    // Check length
    if (tweet.text.length > 280) {
      this.logger.warn('Tweet too long:', tweet.text.length);
      return false;
    }
    
    // Ensure URL is present
    if (!tweet.text.includes('github.com')) {
      this.logger.warn('Missing GitHub URL');
      return false;
    }
    
    // Check for banned words/phrases (if any)
    const banned = ['spam', 'scam', 'click here'];
    if (banned.some(word => tweet.text.toLowerCase().includes(word))) {
      this.logger.warn('Contains banned words');
      return false;
    }
    
    return true;
  }
}
```

**Time Budget:** 5-10 minutes

**Output:** Tweet posted to Twitter with project announcement

---

## ORCHESTRATOR IMPLEMENTATION

```typescript
// Main orchestrator that coordinates all oracles
class Slopinator9000Orchestrator {
  private trendScout: TrendScoutOracle;
  private ideaGenerator: IdeaGeneratorOracle;
  private researcher: ResearchMasterOracle;
  private implementer: ImplementationMasterOracle;
  private deployer: DeploymentSpecialistOracle;
  private announcer: TwitterAnnouncerOracle;
  
  private logger: Logger;
  private state: OrchestratorState;
  
  async run(): Promise<RunResult> {
    this.logger.info('🚀 Slopinator-9000 starting...');
    
    try {
      // Phase 1: Scout trends
      this.logger.info('📊 Phase 1: Scouting trends...');
      const trends = await this.trendScout.scoutTrends({
        period: 'daily',
        language: ['TypeScript', 'JavaScript'],
        minStars: 100
      });
      
      if (trends.length === 0) {
        throw new Error('No suitable trends found');
      }
      
      this.state.trends = trends;
      this.logger.info(`Found ${trends.length} potential trends`);
      
      // Phase 2: Generate ideas
      this.logger.info('💡 Phase 2: Generating ideas...');
      const allIdeas = [];
      
      for (const trend of trends.slice(0, 3)) { // Top 3 trends
        const ideas = await this.ideaGenerator.generateIdeas(trend);
        allIdeas.push(...ideas);
      }
      
      if (allIdeas.length === 0) {
        throw new Error('No viable ideas generated');
      }
      
      this.state.ideas = allIdeas;
      this.logger.info(`Generated ${allIdeas.length} ideas`);
      
      // Phase 3: Research best idea
      this.logger.info('🔍 Phase 3: Researching ideas...');
      let research: ResearchReport | null = null;
      let selectedIdea: GeneratedIdea | null = null;
      
      for (const idea of allIdeas) {
        research = await this.researcher.research(idea);
        
        if (research.recommendation === 'SHIP') {
          selectedIdea = idea;
          break;
        }
        
        if (research.recommendation === 'PIVOT') {
          // Try to pivot (future enhancement)
          continue;
        }
        
        // ABORT - try next idea
      }
      
      if (!selectedIdea || !research) {
        throw new Error('No shippable ideas after research');
      }
      
      this.state.selectedIdea = selectedIdea;
      this.state.research = research;
      this.logger.info(`Selected idea: ${selectedIdea.name}`);
      
      // Phase 4: Implement
      this.logger.info('⚡ Phase 4: Implementing...');
      const implementation = await this.implementer.implement(
        selectedIdea,
        research
      );
      
      if (implementation.status === 'failed') {
        throw new Error('Implementation failed');
      }
      
      this.state.implementation = implementation;
      this.logger.info(`Implementation ${implementation.status}`);
      
      // Phase 5: Deploy
      this.logger.info('🚢 Phase 5: Deploying...');
      const deployment = await this.deployer.deploy(
        implementation,
        selectedIdea
      );
      
      if (!deployment.success) {
        throw new Error('Deployment failed');
      }
      
      this.state.deployment = deployment;
      this.logger.info(`Deployed to: ${deployment.repoUrl}`);
      
      // Phase 6: Announce
      this.logger.info('📢 Phase 6: Announcing...');
      const announcement = await this.announcer.announce(
        deployment,
        selectedIdea,
        implementation
      );
      
      this.state.announcement = announcement;
      
      if (announcement.success) {
        this.logger.info(`Tweeted: ${announcement.tweetUrl}`);
      }
      
      // Success!
      this.logger.info('✅ Slopinator-9000 completed successfully!');
      
      return {
        success: true,
        idea: selectedIdea,
        repoUrl: deployment.repoUrl,
        tweetUrl: announcement.tweetUrl,
        totalTime: this.calculateTotalTime(),
        state: this.state
      };
      
    } catch (error) {
      this.logger.error('❌ Slopinator-9000 failed:', error);
      
      return {
        success: false,
        error: error.message,
        state: this.state
      };
    }
  }
}
```

---

## LOGGING & MONITORING

All oracles log to a structured format:

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  oracle: string;
  phase: string;
  message: string;
  data?: any;
  duration?: number;
}

// Example log entry
{
  "timestamp": "2024-02-16T14:30:45.123Z",
  "level": "info",
  "oracle": "trend-scout",
  "phase": "scout-trends",
  "message": "Found 5 trending repos",
  "data": {
    "period": "daily",
    "repos": [...]
  },
  "duration": 12.5
}
```

Logs are stored in:
- `logs/run-{timestamp}.jsonl` - Full run log
- `logs/errors.jsonl` - Errors only
- `logs/metrics.json` - Aggregated metrics

---

## CONFIGURATION

```typescript
// config.ts
export const config = {
  // Oracles
  oracles: {
    trendScout: {
      enabled: true,
      period: 'daily',
      maxRepos: 5
    },
    ideaGenerator: {
      enabled: true,
      strategiesPerRepo: 3
    },
    researcher: {
      enabled: true,
      headless: false, // ALWAYS false for visibility
      timeout: 1800000 // 30 minutes
    },
    implementer: {
      enabled: true,
      maxHours: 8,
      piAgentPath: '/path/to/pi'
    },
    deployer: {
      enabled: true,
      publishNpm: true,
      github: {
        org: 'slopinator-9000',
        token: process.env.GITHUB_TOKEN
      }
    },
    announcer: {
      enabled: true,
      twitter: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET
      }
    }
  },
  
  // Time budgets
  timeBudgets: {
    trendScout: 900, // 15 minutes
    ideaGenerator: 1200, // 20 minutes
    researcher: 1800, // 30 minutes
    implementer: 28800, // 8 hours
    deployer: 1200, // 20 minutes
    announcer: 600 // 10 minutes
  },
  
  // Retry policies
  retries: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 1000
  }
};
```

---

## USAGE

```bash
# Run once
npm run slopinator-9000

# Run in cron (daily)
0 9 * * * cd /path/to/slopinator-9000 && npm run slopinator-9000

# Run with specific trend period
npm run slopinator-9000 -- --period weekly

# Dry run (no deploy/tweet)
npm run slopinator-9000 -- --dry-run
```

---

This agent architecture provides a complete autonomous pipeline from trending repos to deployed projects, with each oracle having clear responsibilities and interfaces. The system is designed for velocity while maintaining visibility and control through comprehensive logging and monitoring.