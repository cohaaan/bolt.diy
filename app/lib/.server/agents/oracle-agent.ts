import { BaseAgent, type AgentCallOptions, type AgentResponse } from './base-agent';
import type { AgentModelConfig } from '~/lib/stores/agentState';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OracleAgent');

const ORACLE_SYSTEM_PROMPT = `You are the Oracle - a deep reasoning agent called when simpler approaches have failed.

You are invoked after multiple failed attempts to solve a problem. Your job is to:
1. Analyze the full error history
2. Identify the ROOT CAUSE (not symptoms)
3. Produce a DEFINITIVE fix strategy

Analysis approach:
1. List all errors encountered
2. Identify patterns in failures
3. Check for common root causes:
   - Missing dependencies
   - Wrong import paths
   - Type mismatches
   - API version issues
   - Build configuration problems
4. Produce a step-by-step fix plan

Output format (JSON only, no markdown):
{
  "rootCause": "Clear description of the fundamental problem",
  "evidence": ["error1 indicates X", "error2 confirms Y"],
  "fixStrategy": {
    "steps": [
      {"action": "modify", "file": "path/to/file", "change": "description"},
      {"action": "add", "file": "path/to/new", "content": "description"}
    ],
    "reasoning": "Why this fix addresses the root cause"
  },
  "confidence": 0.9,
  "alternativeApproaches": ["If this doesn't work, try X"]
}

Be thorough. This is the last resort before asking the human for help.`;

export class OracleAgent extends BaseAgent {
  constructor(modelConfig: AgentModelConfig) {
    super({
      name: 'OracleAgent',
      type: 'oracle',
      modelConfig,
      systemPrompt: ORACLE_SYSTEM_PROMPT,
      maxTokens: 4000,
      temperature: 0.5,
    });
  }

  async execute(
    userRequest: string,
    options: AgentCallOptions,
    context?: Record<string, unknown>,
  ): Promise<AgentResponse> {
    const errorHistory = (context?.errorHistory as Array<{ error: string; attemptedFix: string }>) || [];

    logger.info(`Oracle invoked after ${errorHistory.length} failures`);

    const prompt = this.buildOraclePrompt(userRequest, errorHistory);
    const messages = this.buildMessages(prompt, context);

    const response = await this.callLLM(messages, options, {
      maxTokens: 4000,
      temperature: 0.5,
    });

    return response;
  }

  private buildOraclePrompt(
    userRequest: string,
    errorHistory: Array<{ error: string; attemptedFix: string }>,
  ): string {
    let prompt = `## Original Request\n${userRequest}\n\n`;

    prompt += `## Error History (${errorHistory.length} failures)\n`;

    for (let i = 0; i < errorHistory.length; i++) {
      const entry = errorHistory[i];
      prompt += `\n### Attempt ${i + 1}\n`;
      prompt += `**Error:** ${entry.error}\n`;
      prompt += `**Attempted Fix:** ${entry.attemptedFix}\n`;
    }

    prompt += `\n## Your Task\n`;
    prompt += `Analyze these failures deeply and provide a definitive fix strategy.\n`;

    return prompt;
  }

  parseOracleResponse(content: string): {
    rootCause: string;
    fixStrategy: {
      steps: Array<{ action: string; file: string; change: string }>;
      reasoning: string;
    };
    confidence: number;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse Oracle response');
    }

    return {
      rootCause: 'Unable to determine root cause',
      fixStrategy: {
        steps: [],
        reasoning: content,
      },
      confidence: 0.3,
    };
  }
}

export function createOracleAgent(modelConfig: AgentModelConfig): OracleAgent {
  return new OracleAgent(modelConfig);
}
