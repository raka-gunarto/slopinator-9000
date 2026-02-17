import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  createCodingTools,
  createReadOnlyTools,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import { getModel, type Model, type Api } from '@mariozechner/pi-ai';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import type { BuildError } from '../types/oracles.js';

export interface PiTask {
  task: string;
  context?: unknown;
  instructions?: string;
  timeLimit?: number;
  command?: string;
  timeout?: number;
}

export interface PiAgentOptions {
  /** Override model, e.g. getModel('github-copilot', 'claude-haiku-4.5') */
  model?: Model<any>;
  /** Thinking level: 'off' | 'minimal' | 'low' | 'medium' | 'high' */
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  /** Use read-only tools (no bash/edit/write). Good for analysis tasks. */
  readOnly?: boolean;
}

export interface PiResult {
  success: boolean;
  exitCode: number;
  filesCreated?: string[];
  filesModified?: string[];
  errors?: BuildError[];
  duration?: number;
  output?: string;
}

/**
 * Pi coding agent integration using the @mariozechner/pi-coding-agent SDK.
 * Creates agent sessions with built-in coding tools (read, bash, edit, write)
 * and prompts the agent to perform implementation tasks.
 */
export class PiAgent {
  private workspace: string;
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private options: PiAgentOptions;

  constructor(options?: PiAgentOptions) {
    this.workspace = config.pi.workspace;
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
    this.options = options ?? {};
  }

  /** Get a pre-configured Haiku instance for lightweight analysis tasks. */
  static haiku(): PiAgent {
    return new PiAgent({
      model: getModel('github-copilot', 'claude-haiku-4.5'),
      thinkingLevel: 'off',
      readOnly: true,
    });
  }

  /** Get a pre-configured Sonnet 4.5 instance for implementation tasks. */
  static sonnet(): PiAgent {
    return new PiAgent({
      model: getModel('github-copilot', 'claude-sonnet-4.5'),
    });
  }

  /**
   * Execute a task by creating a coding agent session, prompting it,
   * and collecting the result.
   */
  async execute(task: PiTask): Promise<PiResult> {
    const startTime = Date.now();
    const output: string[] = [];
    const errors: BuildError[] = [];

    logger.info(`Executing Pi task: ${task.task}`, undefined, 'pi-agent');

    try {
      // Determine working directory — use context.projectPath if available, else workspace
      const cwd =
        (task.context as Record<string, unknown>)?.projectPath as string | undefined
        ?? this.workspace;

      // Create an in-memory session with coding tools pointed at the project dir
      const tools = this.options.readOnly
        ? createReadOnlyTools(cwd)
        : createCodingTools(cwd);

      const { session } = await createAgentSession({
        cwd,
        tools,
        sessionManager: SessionManager.inMemory(),
        settingsManager: SettingsManager.inMemory({
          compaction: { enabled: false },
          retry: { enabled: true, maxRetries: 3 },
        }),
        authStorage: this.authStorage,
        modelRegistry: this.modelRegistry,
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(this.options.thinkingLevel ? { thinkingLevel: this.options.thinkingLevel } : {}),
      });

      // Subscribe to stream events for rich visibility
      let turnCount = 0;
      const toolTimers = new Map<string, number>();

      session.subscribe((event: AgentSessionEvent) => {
        switch (event.type) {
          // ── Turn lifecycle ───────────────────────────────
          case 'turn_start':
            turnCount++;
            logger.info(`── Turn ${turnCount} ──`, undefined, 'pi-agent');
            break;
          case 'turn_end':
            logger.debug(
              `Turn ${turnCount} ended (${event.toolResults?.length ?? 0} tool results)`,
              undefined,
              'pi-agent',
            );
            break;

          // ── Tool execution ───────────────────────────────
          case 'tool_execution_start': {
            toolTimers.set(event.toolCallId, Date.now());
            const argsPreview = this.formatToolArgs(event.toolName, event.args);
            logger.start(`🔧 ${event.toolName}${argsPreview}`, 'pi-agent');
            break;
          }
          case 'tool_execution_end': {
            const elapsed = toolTimers.get(event.toolCallId);
            const dur = elapsed ? ` (${((Date.now() - elapsed) / 1000).toFixed(1)}s)` : '';
            toolTimers.delete(event.toolCallId);
            if (event.isError) {
              logger.warn(`🔧 ${event.toolName} failed${dur}`, undefined, 'pi-agent');
            } else {
              logger.success(`🔧 ${event.toolName} done${dur}`, 'pi-agent');
            }
            break;
          }

          // ── Message streaming ────────────────────────────
          case 'message_update': {
            const me = event.assistantMessageEvent;
            if (me.type === 'text_delta') {
              output.push(me.delta);
              process.stdout.write(me.delta);
            } else if (me.type === 'thinking_start') {
              logger.debug('💭 thinking...', undefined, 'pi-agent');
            }
            break;
          }

          // ── Retry / compaction ───────────────────────────
          case 'auto_retry_start':
            logger.warn(
              `♻️  Retry ${event.attempt}/${event.maxAttempts} in ${(event.delayMs / 1000).toFixed(1)}s — ${event.errorMessage}`,
              undefined,
              'pi-agent',
            );
            break;
          case 'auto_retry_end':
            if (event.success) {
              logger.success(`♻️  Retry ${event.attempt} succeeded`, 'pi-agent');
            } else {
              logger.error(`♻️  Retry ${event.attempt} failed: ${event.finalError}`, undefined, 'pi-agent');
            }
            break;
          case 'auto_compaction_start':
            logger.info(`📦 Context compaction (${event.reason})...`, undefined, 'pi-agent');
            break;
          case 'auto_compaction_end':
            if (event.aborted) {
              logger.warn('📦 Compaction aborted', undefined, 'pi-agent');
            } else {
              logger.success('📦 Compaction done', 'pi-agent');
            }
            break;
        }
      });

      // Build the prompt from task instructions + context
      const prompt = this.buildPrompt(task);

      logger.debug(`Pi prompt length: ${prompt.length} chars`, undefined, 'pi-agent');

      // Run the agent with a timeout
      const timeoutMs = task.timeout || (task.timeLimit ? task.timeLimit * 1000 : 3600000);

      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), timeoutMs),
      );

      const result = await Promise.race([
        session.prompt(prompt).then(() => 'done' as const),
        timeoutPromise,
      ]);

      const duration = (Date.now() - startTime) / 1000;

      if (result === 'timeout') {
        logger.warn(`Pi task timeout after ${timeoutMs}ms`, undefined, 'pi-agent');
        await session.abort();
        session.dispose();
        return {
          success: false,
          exitCode: 124,
          duration,
          output: output.join(''),
          errors: [{
            type: 'runtime',
            file: 'unknown',
            message: `Task timed out after ${(timeoutMs / 1000).toFixed(0)}s`,
            severity: 'error',
          }],
        };
      }

      logger.info(
        `Pi task completed in ${duration.toFixed(1)}s`,
        undefined,
        'pi-agent',
      );

      // Check for errors in the agent state
      const agentError = session.state?.error;
      if (agentError) {
        errors.push({
          type: 'runtime',
          file: 'unknown',
          message: agentError,
          severity: 'error',
        });
      }

      session.dispose();

      return {
        success: errors.length === 0,
        exitCode: errors.length === 0 ? 0 : 1,
        duration,
        output: output.join(''),
        errors,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Pi agent error: ${msg}`, undefined, 'pi-agent');

      return {
        success: false,
        exitCode: 1,
        duration: (Date.now() - startTime) / 1000,
        output: output.join(''),
        errors: [{
          type: 'runtime',
          file: 'unknown',
          message: msg,
          severity: 'error',
        }],
      };
    }
  }

  /**
   * Build the full prompt from a PiTask, combining instructions and context.
   */
  private buildPrompt(task: PiTask): string {
    const parts: string[] = [];

    if (task.instructions) {
      parts.push(task.instructions);
    } else {
      parts.push(`Task: ${task.task}`);
    }

    if (task.context) {
      const ctx = task.context as Record<string, unknown>;
      // Include relevant context fields in the prompt
      if (ctx.feature) {
        parts.push(`\n## Feature Context\n${JSON.stringify(ctx.feature, null, 2)}`);
      }
      if (ctx.idea) {
        parts.push(`\n## Project Context\n${JSON.stringify(ctx.idea, null, 2)}`);
      }
      if (ctx.inspiration && Array.isArray(ctx.inspiration) && ctx.inspiration.length > 0) {
        parts.push(`\n## Inspiration\n${JSON.stringify(ctx.inspiration, null, 2)}`);
      }
    }

    if (task.command) {
      parts.push(`\nRun this command: ${task.command}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Format tool arguments into a short, readable preview for logging.
   */
  private formatToolArgs(toolName: string, args: any): string {
    if (!args || typeof args !== 'object') return '';

    try {
      switch (toolName) {
        case 'bash':
        case 'run_terminal_command': {
          const cmd = args.command || args.cmd || '';
          const short = cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd;
          return `: \`${short}\``;
        }
        case 'read_file': {
          const file = args.file_path || args.filePath || args.path || '';
          const base = file.split('/').slice(-2).join('/');
          return `: ${base}`;
        }
        case 'write_file':
        case 'create_file': {
          const file = args.file_path || args.filePath || args.path || '';
          const base = file.split('/').slice(-2).join('/');
          return `: ${base}`;
        }
        case 'edit_file':
        case 'replace_in_file': {
          const file = args.file_path || args.filePath || args.path || '';
          const base = file.split('/').slice(-2).join('/');
          return `: ${base}`;
        }
        case 'list_directory':
        case 'list_dir': {
          const dir = args.path || args.directory || '';
          const base = dir.split('/').slice(-2).join('/');
          return `: ${base}`;
        }
        case 'grep':
        case 'search': {
          const q = args.pattern || args.query || args.regex || '';
          return `: "${q}"`;
        }
        default:
          return '';
      }
    } catch {
      return '';
    }
  }
}
