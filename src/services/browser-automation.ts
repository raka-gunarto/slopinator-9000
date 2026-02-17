import puppeteer, { type Browser, type Page } from 'puppeteer';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

export class BrowserAutomation {
  private browser: Browser | null = null;
  private screenshotDir: string;
  private visitedUrls: string[] = [];

  constructor() {
    this.screenshotDir = path.join(process.cwd(), 'logs', 'screenshots');
  }

  async launch(): Promise<void> {
    logger.info('Launching Chrome browser...', undefined, 'browser');

    await fs.mkdir(this.screenshotDir, { recursive: true });

    // Determine headless mode:
    //  - User wants headful (HEADLESS=false): try headful, but fall back if no display
    //  - User wants headless (HEADLESS=true): always headless
    let headless: boolean | 'shell' = config.system.headless;
    const hasDisplay = !!process.env.DISPLAY;

    if (!config.system.headless && !hasDisplay) {
      logger.warn(
        'No DISPLAY available — falling back to headless mode '
        + '(set DISPLAY or run with xvfb-run for headful)',
        undefined,
        'browser',
      );
      headless = 'shell';
    }

    this.browser = await puppeteer.launch({
      headless,
      slowMo: headless === false ? 100 : 0,
      devtools: headless === false,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });

    logger.info(
      `Browser launched (${headless === false ? 'headful' : 'headless'})`,
      undefined,
      'browser',
    );
  }

  async newPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not launched — call launch() first');
    }

    const page = await this.browser.newPage();

    page.on('response', (response) => {
      const url = response.url();
      if (!this.visitedUrls.includes(url)) {
        this.visitedUrls.push(url);
      }
    });

    return page;
  }

  async screenshot(name: string, page?: Page): Promise<string> {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }

    // Use the provided page, or fall back to the last open page
    let target = page;
    if (!target) {
      const pages = await this.browser.pages();
      if (pages.length === 0) {
        throw new Error('No pages open');
      }
      target = pages[pages.length - 1];
    }

    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeName}-${Date.now()}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    await target.screenshot({ path: filepath, fullPage: true });
    logger.debug(`Screenshot saved: ${filepath}`, undefined, 'browser');

    return filepath;
  }

  getVisitedUrls(): string[] {
    return [...this.visitedUrls];
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed', undefined, 'browser');
    }
  }

  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
