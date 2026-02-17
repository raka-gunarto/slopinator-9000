import type {
  GeneratedIdea,
  ResearchReport,
  ImplementationResult,
  DeploymentResult,
  TweetResult,
  TrendingRepo,
} from './oracles.js';

export interface OrchestratorState {
  runId: string;
  startTime: Date;
  trends?: TrendingRepo[];
  ideas?: GeneratedIdea[];
  selectedIdea?: GeneratedIdea;
  research?: ResearchReport;
  implementation?: ImplementationResult;
  deployment?: DeploymentResult;
  announcement?: TweetResult;
  currentPhase: string;
  errors: Array<{
    phase: string;
    error: string;
    timestamp: Date;
  }>;
}

export interface RunResult {
  success: boolean;
  idea?: GeneratedIdea;
  repoUrl?: string;
  tweetUrl?: string;
  totalTime: number;
  state: OrchestratorState;
  error?: string;
}
