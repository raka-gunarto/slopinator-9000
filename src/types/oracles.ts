// ===== Trend Scout Types =====

export interface ScoutOptions {
  period: 'daily' | 'weekly' | 'monthly';
  language?: string[];
  minStars?: number;
  maxAge?: number; // days
  topics?: string[];
}

export interface TrendingRepo {
  url: string;
  name: string;
  owner: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  createdAt: Date;
  lastPush: Date;
  ideaPotential: number;
  complexity: 'simple' | 'moderate' | 'complex';
  ideaSurfaces: string[];
  reasoning: string;
}

export interface TrendScoutOracle {
  scoutTrends(options: ScoutOptions): Promise<TrendingRepo[]>;
  analyzeRepo(repoUrl: string): Promise<TrendingRepo>;
  rankByPotential(repos: TrendingRepo[]): TrendingRepo[];
}

// ===== Idea Generator Types =====

export type IdeaStrategy =
  | 'adjacent'
  | 'complementary'
  | 'abstraction'
  | 'inverse'
  | 'transfer'
  | 'niche';

export interface Feature {
  name: string;
  description: string;
  priority: 'must' | 'should' | 'could';
  estimatedHours: number;
}

export interface GeneratedIdea {
  name: string;
  tagline: string;
  description: string;
  tweetPitch: string;
  originalRepo: string;
  strategy: IdeaStrategy;
  language: 'TypeScript';
  runtime: 'Node.js' | 'Browser' | 'Both';
  dependencies: string[];
  coreFeatures: Feature[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedHours: number;
  slopFactor: number;
  mvpDefinition: string;
  successMetric: string;
}

export interface IdeaValidation {
  isNovel: boolean;
  isBuildable: boolean;
  isInteresting: boolean;
  confidence: number;
  concerns: string[];
  recommendations: string[];
}

export interface IdeaGeneratorOracle {
  generateIdeas(repo: TrendingRepo): Promise<GeneratedIdea[]>;
  /** Generate original ideas by synthesising ALL trending repos via LLM. */
  generateOriginalIdeas(repos: TrendingRepo[]): Promise<GeneratedIdea[]>;
  applyStrategy(repo: TrendingRepo, strategy: IdeaStrategy): Promise<GeneratedIdea>;
  validateIdea(idea: GeneratedIdea): Promise<IdeaValidation>;
}

// ===== Research Master Types =====

export interface ExistenceCheck {
  exactDuplicates: Array<{
    url: string;
    name: string;
    stars: number;
  }>;
  similarProjects: Array<{
    url: string;
    name: string;
    stars: number;
  }>;
  npmPackages: Array<{
    name: string;
    downloads: string;
  }>;
  isNovel: boolean;
  marketGap: string;
}

export interface DependencyReport {
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

export interface InspirationSource {
  url: string;
  title: string;
  type: 'github' | 'article' | 'docs' | 'tutorial';
  relevance: number;
  keyTakeaways: string[];
  screenshotPath?: string;
}

export interface Risk {
  category: 'technical' | 'market' | 'time' | 'scope';
  severity: 'low' | 'medium' | 'high' | 'blocker';
  description: string;
  mitigation?: string;
}

export interface ImplementationHints {
  architecturePatterns: string[];
  fileStructure: string[];
  commonDependencies: string[];
  apiExamples: string[];
}

export interface ResearchReport {
  idea: GeneratedIdea;
  timestamp: Date;
  existence: ExistenceCheck;
  dependencies: DependencyReport;
  inspiration: InspirationSource[];
  technicalRisks: Risk[];
  recommendation: 'SHIP' | 'PIVOT' | 'ABORT';
  confidence: number;
  reasoning: string;
  screenshots: string[];
  visitedUrls: string[];
  researchDuration: number;
  implementationHints: ImplementationHints;
}

export interface ResearchMasterOracle {
  research(idea: GeneratedIdea): Promise<ResearchReport>;
  checkExistence(idea: GeneratedIdea): Promise<ExistenceCheck>;
  validateDependencies(deps: string[]): Promise<DependencyReport>;
  findInspiration(keywords: string[]): Promise<InspirationSource[]>;
}

// ===== Implementation Master Types =====

export interface ProjectSetup {
  repoPath: string;
  packageJson: object;
  tsConfig: object;
  initialized: boolean;
  errors: string[];
}

export interface BuildError {
  type: 'syntax' | 'type' | 'runtime' | 'dependency';
  file: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface BuildResult {
  success: boolean;
  filesCreated: string[];
  linesOfCode: number;
  timeSpent: number;
  errors: BuildError[];
  warnings: string[];
}

export interface ImplementationResult {
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
  totalHours: number;
  linesOfCode: number;
  filesCreated: number;
  issues: BuildError[];
  technicalDebt: string[];
  todoItems: string[];
}

export interface ImplementationMasterOracle {
  implement(idea: GeneratedIdea, research: ResearchReport): Promise<ImplementationResult>;
  initializeProject(idea: GeneratedIdea): Promise<ProjectSetup>;
}

// ===== Deployment Types =====

export interface DeploymentResult {
  success: boolean;
  repoUrl: string;
  npmUrl?: string;
  releaseTag: string;
  deployedAt: Date;
  initialCommit: string;
  filesDeployed: number;
  badges: string[];
  warnings: string[];
  errors: string[];
}

export interface DeploymentSpecialistOracle {
  deploy(implementation: ImplementationResult, idea: GeneratedIdea): Promise<DeploymentResult>;
  createGitHubRepo(name: string, description: string): Promise<{
    url: string;
    name: string;
    cloneUrl: string;
  }>;
}

// ===== Twitter Types =====

export type TweetStyle = 'honest' | 'meme' | 'technical' | 'chaotic';

export interface Tweet {
  text: string;
  style: TweetStyle;
  metadata: {
    githubUrl: string;
    npmUrl?: string;
    hashtags: string[];
  };
}

export interface TweetResult {
  success: boolean;
  tweetUrl?: string;
  tweetId?: string;
  timestamp: Date;
}

export interface TwitterAnnouncerOracle {
  announce(
    deployment: DeploymentResult,
    idea: GeneratedIdea,
    implementation: ImplementationResult,
  ): Promise<TweetResult>;
}
