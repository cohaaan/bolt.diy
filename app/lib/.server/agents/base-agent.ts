import { generateText } from 'ai';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import type { AgentModelConfig, AgentType } from '~/lib/stores/agentState';

const logger = createScopedLogger('BaseAgent');

export interface AgentConfig {
  name: string;
  type: AgentType;
  modelConfig: AgentModelConfig;
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentResponse {
  content: string;
  tokenCount?: number;
  model: string;
  provider: string;
  duration: number;
}

export interface AgentCallOptions {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  serverEnv?: Record<string, string>;
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected logger = logger;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get type(): AgentType {
    return this.config.type;
  }

  abstract execute(
    input: string,
    options: AgentCallOptions,
    context?: Record<string, unknown>,
  ): Promise<AgentResponse>;

  protected async callLLM(
    messages: AgentMessage[],
    options: AgentCallOptions,
    llmOptions?: { maxTokens?: number; temperature?: number },
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const { provider: providerName, model: modelName } = this.config.modelConfig;

    try {
      const llmManager = LLMManager.getInstance(options.serverEnv || {});
      const provider = llmManager.getProvider(providerName);

      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }

      const modelInstance = provider.getModelInstance({
        model: modelName,
        serverEnv: options.serverEnv as unknown as Env,
        apiKeys: options.apiKeys,
        providerSettings: options.providerSettings,
      });

      const result = await generateText({
        model: modelInstance,
        system: this.config.systemPrompt,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        maxTokens: llmOptions?.maxTokens || this.config.maxTokens || 2000,
        temperature: llmOptions?.temperature ?? this.config.temperature ?? 0.3,
      });

      const duration = Date.now() - startTime;

      logger.info(`${this.name} completed in ${duration}ms using ${providerName}/${modelName}`);

      return {
        content: result.text,
        tokenCount: result.usage?.totalTokens,
        model: modelName,
        provider: providerName,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`${this.name} failed:`, errorMsg);
      throw error;
    }
  }

  protected buildMessages(input: string, context?: Record<string, unknown>): AgentMessage[] {
    const messages: AgentMessage[] = [];

    if (context) {
      messages.push({
        role: 'user',
        content: `Context:\n${JSON.stringify(context, null, 2)}`,
      });
    }

    messages.push({ role: 'user', content: input });

    return messages;
  }

  updateModelConfig(modelConfig: AgentModelConfig) {
    this.config.modelConfig = modelConfig;
    logger.info(`${this.name} updated to use ${modelConfig.provider}/${modelConfig.model}`);
  }
}
