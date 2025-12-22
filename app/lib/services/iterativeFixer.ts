import { createScopedLogger } from '~/utils/logger';
import { testStateStore, type TestResult } from '~/lib/stores/testState';
import { autoTestRunner } from './autoTestRunner';
import { chatFeedback } from './chatFeedback';

const logger = createScopedLogger('IterativeFixer');

class IterativeFixer {
  private _fixInProgress = new Map<string, boolean>();

  async handleTestFailure(testResult: TestResult): Promise<boolean> {
    const { artifactId, errors } = testResult;

    // Check if already fixing this artifact
    if (this._fixInProgress.get(artifactId)) {
      logger.info('Fix already in progress for:', artifactId);
      return false;
    }

    // Check if stuck
    if (testStateStore.isStuck(artifactId)) {
      logger.warn(`Artifact ${artifactId} is stuck - max retries exceeded`);
      this.notifyStuck(artifactId);
      return false;
    }

    const config = testStateStore.config.get();
    const retryCount = testStateStore.getRetryCount(artifactId);

    logger.info(`Attempting fix ${retryCount}/${config.maxRetries} for artifact:`, artifactId);

    this._fixInProgress.set(artifactId, true);

    try {
      // The error feedback has already been sent by autoTestRunner
      // The fix will happen when Claude responds
      // We just need to wait for the next artifact completion

      return true;
    } finally {
      this._fixInProgress.set(artifactId, false);
    }
  }

  private notifyStuck(artifactId: string) {
    const config = testStateStore.config.get();

    logger.error(`Artifact ${artifactId} stuck after ${config.maxRetries} attempts`);

    // Could trigger a UI notification here
    // For now, the UI will show "stuck" status from testStateStore
  }

  shouldRetry(artifactId: string): boolean {
    return !testStateStore.isStuck(artifactId);
  }

  resetFixer(artifactId: string) {
    this._fixInProgress.delete(artifactId);
    testStateStore.resetRetryCount(artifactId);
    logger.info('Reset fixer for:', artifactId);
  }

  resetAll() {
    this._fixInProgress.clear();
    testStateStore.clearHistory();
    logger.info('Reset all fixers');
  }

  getStatus(artifactId: string): {
    isFixing: boolean;
    retryCount: number;
    isStuck: boolean;
    maxRetries: number;
  } {
    const config = testStateStore.config.get();

    return {
      isFixing: this._fixInProgress.get(artifactId) || false,
      retryCount: testStateStore.getRetryCount(artifactId),
      isStuck: testStateStore.isStuck(artifactId),
      maxRetries: config.maxRetries,
    };
  }
}

export const iterativeFixer = new IterativeFixer();
