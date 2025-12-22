import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LintingService');

export interface LintError {
  file: string;
  line: number;
  column: number;
  message: string;
  ruleId: string;
  severity: 'error' | 'warning';
}

export interface LintResult {
  success: boolean;
  errors: LintError[];
  warnings: LintError[];
  duration: number;
}

class LintingService {
  private _enabled = true;

  setEnabled(enabled: boolean) {
    this._enabled = enabled;
    logger.info(`Linting ${enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  async runLint(files?: string[]): Promise<LintResult> {
    if (!this._enabled) {
      return {
        success: true,
        errors: [],
        warnings: [],
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      // Call the server-side lint API
      const response = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });

      if (!response.ok) {
        logger.warn('Lint API unavailable, skipping lint check');

        return {
          success: true,
          errors: [],
          warnings: [],
          duration: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as {
        success: boolean;
        errors: LintError[];
        warnings: LintError[];
      };

      const duration = Date.now() - startTime;

      logger.info(`Lint completed in ${duration}ms: ${data.errors.length} errors, ${data.warnings.length} warnings`);

      return {
        success: data.errors.length === 0,
        errors: data.errors,
        warnings: data.warnings,
        duration,
      };
    } catch (error) {
      logger.warn('Lint check failed, continuing without lint:', error);

      return {
        success: true,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  formatErrorsForAgent(result: LintResult): string {
    if (result.success && result.warnings.length === 0) {
      return '';
    }

    const parts: string[] = [];

    if (result.errors.length > 0) {
      parts.push('## ESLint Errors (must fix)');

      for (const error of result.errors) {
        parts.push(`- **${error.file}:${error.line}:${error.column}** - ${error.message} (${error.ruleId})`);
      }
    }

    if (result.warnings.length > 0) {
      parts.push('## ESLint Warnings (should fix)');

      for (const warning of result.warnings.slice(0, 10)) {
        parts.push(`- **${warning.file}:${warning.line}:${warning.column}** - ${warning.message} (${warning.ruleId})`);
      }

      if (result.warnings.length > 10) {
        parts.push(`... and ${result.warnings.length - 10} more warnings`);
      }
    }

    return parts.join('\n');
  }
}

export const lintingService = new LintingService();
