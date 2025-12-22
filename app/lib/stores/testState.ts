import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TestStateStore');

export interface TestError {
  type: 'console' | 'network' | 'render' | 'timeout' | 'lint';
  message: string;
  stack?: string;
  timestamp: number;
}

export interface TestResult {
  id: string;
  artifactId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'stuck';
  errors: TestError[];
  screenshot?: string;
  timestamp: number;
  duration?: number;
  retryCount: number;
}

export interface TestConfig {
  autoTestEnabled: boolean;
  waitBeforeTest: number; // ms to wait after artifact close
  testTimeout: number; // ms before test times out
  maxRetries: number;
  screenshotOnFail: boolean;
  screenshotOnPass: boolean;
}

const DEFAULT_CONFIG: TestConfig = {
  autoTestEnabled: true,
  waitBeforeTest: 3000,
  testTimeout: 30000,
  maxRetries: 5,
  screenshotOnFail: true,
  screenshotOnPass: false,
};

class TestStateStore {
  currentTest = atom<TestResult | null>(null);
  testHistory = map<Record<string, TestResult>>({});
  isRunning = atom<boolean>(false);
  config = atom<TestConfig>(DEFAULT_CONFIG);

  private _retryCount = new Map<string, number>();

  setCurrentTest(result: TestResult) {
    logger.info('Setting current test:', result.id, result.status);
    this.currentTest.set(result);
    this.addToHistory(result);
  }

  addToHistory(result: TestResult) {
    this.testHistory.setKey(result.id, result);
  }

  getRetryCount(artifactId: string): number {
    return this._retryCount.get(artifactId) || 0;
  }

  incrementRetryCount(artifactId: string): number {
    const count = this.getRetryCount(artifactId) + 1;
    this._retryCount.set(artifactId, count);
    logger.info(`Retry count for ${artifactId}: ${count}`);
    return count;
  }

  resetRetryCount(artifactId: string) {
    this._retryCount.delete(artifactId);
  }

  isStuck(artifactId: string): boolean {
    const maxRetries = this.config.get().maxRetries;
    return this.getRetryCount(artifactId) >= maxRetries;
  }

  updateConfig(partial: Partial<TestConfig>) {
    const current = this.config.get();
    this.config.set({ ...current, ...partial });
    logger.info('Config updated:', this.config.get());
  }

  setAutoTestEnabled(enabled: boolean) {
    this.updateConfig({ autoTestEnabled: enabled });
  }

  createPendingTest(artifactId: string): TestResult {
    const result: TestResult = {
      id: `test-${Date.now()}-${artifactId}`,
      artifactId,
      status: 'pending',
      errors: [],
      timestamp: Date.now(),
      retryCount: this.getRetryCount(artifactId),
    };
    this.setCurrentTest(result);
    return result;
  }

  markTestRunning(testId: string) {
    const current = this.currentTest.get();

    if (current && current.id === testId) {
      this.setCurrentTest({ ...current, status: 'running' });
      this.isRunning.set(true);
    }
  }

  markTestPassed(testId: string, screenshot?: string, duration?: number) {
    const current = this.currentTest.get();

    if (current && current.id === testId) {
      this.setCurrentTest({
        ...current,
        status: 'passed',
        screenshot,
        duration,
      });
      this.isRunning.set(false);
      this.resetRetryCount(current.artifactId);
    }
  }

  markTestFailed(testId: string, errors: TestError[], screenshot?: string, duration?: number) {
    const current = this.currentTest.get();

    if (current && current.id === testId) {
      const retryCount = this.incrementRetryCount(current.artifactId);
      const isStuck = this.isStuck(current.artifactId);

      this.setCurrentTest({
        ...current,
        status: isStuck ? 'stuck' : 'failed',
        errors,
        screenshot,
        duration,
        retryCount,
      });
      this.isRunning.set(false);
    }
  }

  getTestById(testId: string): TestResult | undefined {
    return this.testHistory.get()[testId];
  }

  getTestsForArtifact(artifactId: string): TestResult[] {
    const history = this.testHistory.get();
    return Object.values(history).filter((t) => t.artifactId === artifactId);
  }

  clearHistory() {
    this.testHistory.set({});
    this._retryCount.clear();
    logger.info('Test history cleared');
  }
}

export const testStateStore = new TestStateStore();
