import { createScopedLogger } from '~/utils/logger';
import { testStateStore, type TestError, type TestResult } from '~/lib/stores/testState';

const logger = createScopedLogger('TestingService');

export interface TestRunOptions {
  timeout?: number;
  waitForSelector?: string;
  captureScreenshot?: boolean;
}

export interface RawTestResult {
  success: boolean;
  errors: TestError[];
  screenshot?: string;
  duration: number;
  consoleMessages: string[];
  networkErrors: string[];
}

class TestingService {
  private _isAvailable: boolean | null = null;

  async checkAvailability(): Promise<boolean> {
    if (this._isAvailable !== null) {
      return this._isAvailable;
    }

    try {
      // Check if we're in a Node.js environment with Puppeteer
      if (typeof window !== 'undefined') {
        // Browser environment - testing runs via API
        this._isAvailable = true;
        return true;
      }

      // Server environment - check for Puppeteer
      const puppeteer = await import('puppeteer').catch(() => null);
      this._isAvailable = puppeteer !== null;
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  async runTests(previewUrl: string, options: TestRunOptions = {}): Promise<RawTestResult> {
    const startTime = Date.now();
    const timeout = options.timeout || testStateStore.config.get().testTimeout;

    logger.info('Running tests on:', previewUrl);

    // If in browser, call the API endpoint
    if (typeof window !== 'undefined') {
      return this._runTestsViaApi(previewUrl, options);
    }

    // Server-side Puppeteer execution
    return this._runTestsWithPuppeteer(previewUrl, { ...options, timeout });
  }

  private async _runTestsViaApi(previewUrl: string, options: TestRunOptions): Promise<RawTestResult> {
    const startTime = Date.now();

    try {
      const response = await fetch('/api/test/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewUrl, options }),
      });

      const data = (await response.json()) as { error?: string; result?: RawTestResult };

      if (!response.ok) {
        return {
          success: false,
          errors: [{ type: 'network', message: data.error || 'API request failed', timestamp: Date.now() }],
          duration: Date.now() - startTime,
          consoleMessages: [],
          networkErrors: [],
        };
      }

      return data.result || {
        success: true,
        errors: [],
        duration: Date.now() - startTime,
        consoleMessages: [],
        networkErrors: [],
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            type: 'network',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        ],
        duration: Date.now() - startTime,
        consoleMessages: [],
        networkErrors: [],
      };
    }
  }

  private async _runTestsWithPuppeteer(
    previewUrl: string,
    options: TestRunOptions & { timeout: number },
  ): Promise<RawTestResult> {
    const startTime = Date.now();
    const errors: TestError[] = [];
    const consoleMessages: string[] = [];
    const networkErrors: string[] = [];
    let screenshot: string | undefined;

    try {
      const puppeteer = await import('puppeteer');

      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1280, height: 720 });

      // Capture console messages
      page.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push(`[${msg.type()}] ${text}`);

        if (msg.type() === 'error') {
          errors.push({
            type: 'console',
            message: text,
            timestamp: Date.now(),
          });
        }
      });

      // Capture page errors
      page.on('pageerror', (error) => {
        errors.push({
          type: 'render',
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        });
      });

      // Capture network errors
      page.on('requestfailed', (request) => {
        const failure = request.failure();
        const errorText = `${request.url()}: ${failure?.errorText || 'Unknown error'}`;
        networkErrors.push(errorText);
        errors.push({
          type: 'network',
          message: errorText,
          timestamp: Date.now(),
        });
      });

      // Navigate with timeout
      try {
        await page.goto(previewUrl, {
          waitUntil: 'networkidle0',
          timeout: options.timeout,
        });
      } catch (navError) {
        if (navError instanceof Error && navError.message.includes('timeout')) {
          errors.push({
            type: 'timeout',
            message: `Page load timeout after ${options.timeout}ms`,
            timestamp: Date.now(),
          });
        } else {
          throw navError;
        }
      }

      // Wait for optional selector
      if (options.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
        } catch {
          errors.push({
            type: 'render',
            message: `Selector "${options.waitForSelector}" not found`,
            timestamp: Date.now(),
          });
        }
      }

      // Capture screenshot
      const config = testStateStore.config.get();
      const shouldCapture =
        options.captureScreenshot || (errors.length > 0 ? config.screenshotOnFail : config.screenshotOnPass);

      if (shouldCapture) {
        screenshot = await page.screenshot({ encoding: 'base64' });
      }

      await browser.close();

      const duration = Date.now() - startTime;
      logger.info(`Tests completed in ${duration}ms with ${errors.length} errors`);

      return {
        success: errors.length === 0,
        errors,
        screenshot,
        duration,
        consoleMessages,
        networkErrors,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Test execution failed:', error);

      return {
        success: false,
        errors: [
          {
            type: 'render',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        ],
        duration,
        consoleMessages,
        networkErrors,
      };
    }
  }

  formatErrorsForClaude(errors: TestError[]): string {
    if (errors.length === 0) {
      return '';
    }

    const grouped = {
      console: errors.filter((e) => e.type === 'console'),
      network: errors.filter((e) => e.type === 'network'),
      render: errors.filter((e) => e.type === 'render'),
      timeout: errors.filter((e) => e.type === 'timeout'),
    };

    let output = '## Automated Test Results: FAILED\n\n';
    output += 'The following errors were detected when testing the preview:\n\n';

    if (grouped.console.length > 0) {
      output += '### Console Errors\n';
      grouped.console.forEach((e) => {
        output += `- ${e.message}\n`;
      });
      output += '\n';
    }

    if (grouped.network.length > 0) {
      output += '### Network Errors\n';
      grouped.network.forEach((e) => {
        output += `- ${e.message}\n`;
      });
      output += '\n';
    }

    if (grouped.render.length > 0) {
      output += '### Render Errors\n';
      grouped.render.forEach((e) => {
        output += `- ${e.message}\n`;
        if (e.stack) {
          output += `  \`\`\`\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}\n  \`\`\`\n`;
        }
      });
      output += '\n';
    }

    if (grouped.timeout.length > 0) {
      output += '### Timeout Errors\n';
      grouped.timeout.forEach((e) => {
        output += `- ${e.message}\n`;
      });
      output += '\n';
    }

    output += '**Please fix these issues and regenerate the code.**\n';

    return output;
  }
}

export const testingService = new TestingService();
