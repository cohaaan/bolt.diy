import { createScopedLogger } from '~/utils/logger';
import { testStateStore } from '~/lib/stores/testState';
import { testingService } from './testingService';
import { chatFeedback } from './chatFeedback';
import { workbenchStore } from '~/lib/stores/workbench';
import { agentStateStore } from '~/lib/stores/agentState';
import { lintingService } from './lintingService';

const logger = createScopedLogger('AutoTestRunner');

class AutoTestRunner {
  private _pendingTests = new Map<string, NodeJS.Timeout>();
  private _activeTest: string | null = null;

  async scheduleTest(artifactId: string, messageId?: string) {
    const config = testStateStore.config.get();

    if (!config.autoTestEnabled) {
      logger.info('Auto-testing is disabled, skipping test for:', artifactId);
      return;
    }

    // Cancel any pending test for this artifact
    if (this._pendingTests.has(artifactId)) {
      clearTimeout(this._pendingTests.get(artifactId)!);
    }

    logger.info(`Scheduling test for artifact ${artifactId} in ${config.waitBeforeTest}ms`);

    // Schedule the test after wait period
    const timeout = setTimeout(() => {
      this._pendingTests.delete(artifactId);
      this.runTest(artifactId, messageId);
    }, config.waitBeforeTest);

    this._pendingTests.set(artifactId, timeout);
  }

  cancelTest(artifactId: string) {
    if (this._pendingTests.has(artifactId)) {
      clearTimeout(this._pendingTests.get(artifactId)!);
      this._pendingTests.delete(artifactId);
      logger.info('Cancelled pending test for:', artifactId);
    }
  }

  cancelAllTests() {
    this._pendingTests.forEach((timeout) => clearTimeout(timeout));
    this._pendingTests.clear();
    logger.info('Cancelled all pending tests');
  }

  async runTest(artifactId: string, messageId?: string) {
    // Check if already running a test
    if (this._activeTest) {
      logger.info('Test already running, queueing:', artifactId);
      this.scheduleTest(artifactId, messageId);
      return;
    }

    // Check if stuck (max retries exceeded)
    if (testStateStore.isStuck(artifactId)) {
      logger.warn(`Artifact ${artifactId} is stuck after max retries`);
      return;
    }

    this._activeTest = artifactId;

    try {
      // Create pending test
      const testResult = testStateStore.createPendingTest(artifactId);

      // Get preview URL
      const previewUrl = await this.getPreviewUrl();

      if (!previewUrl) {
        logger.warn('No preview URL available, skipping test');
        testStateStore.markTestFailed(testResult.id, [
          { type: 'render', message: 'No preview URL available', timestamp: Date.now() },
        ]);
        return;
      }

      // Mark test as running
      testStateStore.markTestRunning(testResult.id);

      // GATE 1: Run ESLint before browser tests (Factory AI philosophy)
      const lintResult = await lintingService.runLint();

      if (!lintResult.success) {
        logger.info('ESLint gate failed, sending errors to Claude');
        const lintErrors = lintingService.formatErrorsForAgent(lintResult);

        if (messageId && lintErrors) {
          await chatFeedback.sendMessageToClaude(
            `## ESLint Gate Failed\n\nFix these linting errors before the code can be tested:\n\n${lintErrors}`,
            messageId,
          );
        }

        testStateStore.markTestFailed(testResult.id, [
          { type: 'lint', message: `ESLint found ${lintResult.errors.length} errors`, timestamp: Date.now() },
        ]);

        return;
      }

      logger.info('ESLint gate passed, proceeding to browser tests');

      // GATE 2: Run browser tests (Replit philosophy)
      const result = await testingService.runTests(previewUrl);

      if (result.success) {
        testStateStore.markTestPassed(testResult.id, result.screenshot, result.duration);
        logger.info('Test passed for:', artifactId);

        // Reset agent failure count on success
        agentStateStore.failureCount.set(0);
      } else {
        testStateStore.markTestFailed(testResult.id, result.errors, result.screenshot, result.duration);
        logger.info('Test failed for:', artifactId, 'with', result.errors.length, 'errors');

        // Record error in agent state for Oracle doom loop detection
        const errorSummary = result.errors.map((e) => `[${e.type}] ${e.message}`).join('; ');
        agentStateStore.recordError(errorSummary, `Attempt to fix ${artifactId}`);

        // Check if we should trigger Oracle (doom loop detection)
        const agentConfig = agentStateStore.config.get();

        if (agentStateStore.shouldUseOracle()) {
          logger.warn(`Doom loop detected: ${agentStateStore.failureCount.get()} failures. Oracle should be invoked.`);

          // Send Oracle context to Claude instead of regular error feedback
          if (messageId) {
            const context = agentStateStore.currentContext.get();
            const oraclePrompt = this.buildOraclePrompt(context?.errorHistory || []);
            await chatFeedback.sendMessageToClaude(oraclePrompt, messageId);
          }
        } else {
          // Send regular errors to Claude for fixing
          if (messageId) {
            await chatFeedback.sendTestErrorsToClaude(result.errors, messageId);
          }
        }
      }
    } catch (error) {
      logger.error('Error running test:', error);
    } finally {
      this._activeTest = null;
    }
  }

  async getPreviewUrl(): Promise<string | null> {
    // Get the first available preview URL
    const previews = workbenchStore.previews.get();

    if (previews.length === 0) {
      return null;
    }

    // Find a ready preview
    const readyPreview = previews.find((p) => p.ready);

    if (readyPreview) {
      return readyPreview.baseUrl;
    }

    // If no ready preview, wait briefly and try again
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const updatedPreviews = workbenchStore.previews.get();
    const nowReady = updatedPreviews.find((p) => p.ready);

    return nowReady?.baseUrl || null;
  }

  async manualTest(artifactId?: string) {
    const targetArtifact = artifactId || workbenchStore.firstArtifact?.id;

    if (!targetArtifact) {
      logger.warn('No artifact to test');
      return;
    }

    // Reset retry count for manual tests
    testStateStore.resetRetryCount(targetArtifact);

    // Run immediately
    await this.runTest(targetArtifact);
  }

  private buildOraclePrompt(
    errorHistory: Array<{ error: string; attemptedFix: string; timestamp: number }>,
  ): string {
    const parts: string[] = [];

    parts.push('🔮 **ORACLE MODE ACTIVATED**');
    parts.push('');
    parts.push('Multiple fix attempts have failed. Deep analysis required.');
    parts.push('');
    parts.push('## Error History');

    for (let i = 0; i < errorHistory.length; i++) {
      const entry = errorHistory[i];
      parts.push(`### Attempt ${i + 1}`);
      parts.push(`**Error:** ${entry.error}`);
      parts.push(`**Fix tried:** ${entry.attemptedFix}`);
      parts.push('');
    }

    parts.push('## Instructions');
    parts.push('1. Analyze the pattern of failures above');
    parts.push('2. Identify the ROOT CAUSE (not symptoms)');
    parts.push('3. Provide a DEFINITIVE fix that addresses the fundamental issue');
    parts.push('4. Do NOT repeat previous fix attempts');

    return parts.join('\n');
  }
}

export const autoTestRunner = new AutoTestRunner();
