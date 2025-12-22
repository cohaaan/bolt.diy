import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.lint');

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json<{ files?: string[] }>();

  logger.info('Running lint check', body.files ? `on ${body.files.length} files` : 'on all files');

  // In WebContainer environment, we run ESLint via the terminal
  // For now, return a placeholder that can be enhanced with actual ESLint execution
  // The real implementation would use WebContainer's shell to run `npx eslint`

  try {
    // Simulated lint check - in production this would execute ESLint
    // via WebContainer shell command: `npx eslint --format json ${files.join(' ')}`
    const errors: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      ruleId: string;
      severity: 'error' | 'warning';
    }> = [];

    const warnings: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      ruleId: string;
      severity: 'error' | 'warning';
    }> = [];

    // Return success for now - actual implementation will parse ESLint JSON output
    return json({
      success: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    logger.error('Lint check failed:', error);

    return json(
      {
        success: false,
        errors: [
          {
            file: 'unknown',
            line: 0,
            column: 0,
            message: error instanceof Error ? error.message : 'Unknown lint error',
            ruleId: 'lint-execution-error',
            severity: 'error' as const,
          },
        ],
        warnings: [],
      },
      { status: 500 },
    );
  }
}
