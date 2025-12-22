import { createScopedLogger } from '~/utils/logger';
import { testingService } from './testingService';
import type { TestError } from '~/lib/stores/testState';

const logger = createScopedLogger('ChatFeedback');

export interface ChatContext {
  appendMessage: (content: string) => void;
  sendUserMessage: (content: string) => void;
}

class ChatFeedback {
  private _chatContext: ChatContext | null = null;

  setChatContext(context: ChatContext) {
    this._chatContext = context;
    logger.info('Chat context set');
  }

  clearChatContext() {
    this._chatContext = null;
  }

  async sendTestErrorsToClaude(errors: TestError[], _messageId: string) {
    if (!this._chatContext) {
      logger.warn('No chat context available, cannot send errors to Claude');
      return;
    }

    if (errors.length === 0) {
      logger.info('No errors to send');
      return;
    }

    const errorContext = testingService.formatErrorsForClaude(errors);
    logger.info('Sending test errors to Claude:', errors.length, 'errors');

    // Send as a new user message to trigger Claude to fix
    this._chatContext.sendUserMessage(errorContext);
  }

  sendTestSuccess() {
    if (!this._chatContext) {
      return;
    }

    const successMessage = `## Automated Test Results: PASSED ✅

The preview was tested and no errors were detected. The code appears to be working correctly.`;

    // Optionally notify about success (usually we don't need to send this)
    logger.info('Test passed, not sending message to avoid noise');
  }

  formatRetryMessage(retryCount: number, maxRetries: number): string {
    return `\n\n*[Auto-fix attempt ${retryCount}/${maxRetries}]*`;
  }

  async sendMessageToClaude(message: string, _messageId: string) {
    if (!this._chatContext) {
      logger.warn('No chat context available, cannot send message to Claude');
      return;
    }

    logger.info('Sending message to Claude');
    this._chatContext.sendUserMessage(message);
  }
}

export const chatFeedback = new ChatFeedback();
