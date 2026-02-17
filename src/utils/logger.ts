import { createConsola, type LogType } from 'consola';
import fs from 'fs/promises';
import path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  oracle?: string;
  phase: string;
  message: string;
  data?: unknown;
  duration?: number;
}

const LOG_LEVEL_MAP: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 3,
  debug: 4,
};

class Logger {
  private logDir: string;
  private currentLogFile: string;
  private c;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    const envLevel = process.env.LOG_LEVEL || 'info';
    this.c = createConsola({
      level: LOG_LEVEL_MAP[envLevel] ?? 3,
      fancy: true,
      formatOptions: {
        colors: true,
        date: false,
        compact: false,
      },
    });
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    this.currentLogFile = path.join(this.logDir, `run-${timestamp}.jsonl`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  // ── Public methods matching the old interface ────────────

  debug(message: string, data?: unknown, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.debug(`${tag} ${message}`);
    if (data) this.c.debug(data);
    void this.writeToDisk('debug', message, oracle, data);
  }

  info(message: string, data?: unknown, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.info(`${tag} ${message}`);
    if (data && typeof data === 'object') this.c.info(data);
    void this.writeToDisk('info', message, oracle, data);
  }

  warn(message: string, data?: unknown, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.warn(`${tag} ${message}`);
    if (data) this.c.warn(data);
    void this.writeToDisk('warn', message, oracle, data);
  }

  error(message: string, data?: unknown, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.error(`${tag} ${message}`);
    if (data) this.c.error(data);
    void this.writeToDisk('error', message, oracle, data);
  }

  /** Render a prominent box (e.g. phase banners, final results). */
  box(message: string): void {
    this.c.box(message);
  }

  /** Starting an operation. */
  start(message: string, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.start(`${tag} ${message}`);
    void this.writeToDisk('info', message, oracle);
  }

  /** Operation completed successfully. */
  success(message: string, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.success(`${tag} ${message}`);
    void this.writeToDisk('info', message, oracle);
  }

  /** Service/component is ready. */
  ready(message: string, oracle?: string): void {
    const tag = oracle ? `[${oracle}]` : '';
    this.c.ready(`${tag} ${message}`);
    void this.writeToDisk('info', message, oracle);
  }

  /** Fatal (unrecoverable) error. */
  fatal(message: string, data?: unknown): void {
    this.c.fatal(message);
    if (data) this.c.fatal(data);
    void this.writeToDisk('error', message, undefined, data);
  }

  async logPhase(
    phase: string,
    level: LogEntry['level'],
    message: string,
    oracle?: string,
    data?: unknown,
    duration?: number,
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      oracle,
      phase,
      message,
      data,
      duration,
    };
    this[level](message, data, oracle);
    await this.writeEntry(entry);
  }

  // ── File logging ─────────────────────────────────────────

  private async writeToDisk(
    level: LogEntry['level'],
    message: string,
    oracle?: string,
    data?: unknown,
  ): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      level,
      oracle,
      phase: 'unknown',
      message,
      data,
    });
  }

  private async writeEntry(entry: LogEntry): Promise<void> {
    try {
      await fs.appendFile(this.currentLogFile, JSON.stringify(entry) + '\n');
    } catch {
      // Silently fail file writes if logs dir doesn't exist yet
    }
  }
}

export const logger = new Logger();
