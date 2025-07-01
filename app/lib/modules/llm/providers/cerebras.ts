import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class CerebrasProvider extends BaseProvider {
  name = 'Cerebras';
  getApiKeyLink = 'https://cloud.cerebras.ai/';

  config = {
    apiTokenKey: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'llama-4-scout-17b-16e-instruct',
      label: 'Llama 4 Scout (17B)',
      provider: 'Cerebras',
      maxTokenAllowed: 32000,
    },
    {
      name: 'llama3.1-8b',
      label: 'Llama 3.1 8B',
      provider: 'Cerebras',
      maxTokenAllowed: 32000,
    },
    {
      name: 'llama-3.3-70b',
      label: 'Llama 3.3 70B',
      provider: 'Cerebras',
      maxTokenAllowed: 32000,
    },
    {
      name: 'qwen-3-32b',
      label: 'Qwen 3 32B',
      provider: 'Cerebras',
      maxTokenAllowed: 32000,
    },
    {
      name: 'deepseek-r1-distill-llama-70b',
      label: 'DeepSeek R1 Distill Llama 70B',
      provider: 'Cerebras',
      maxTokenAllowed: 32000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'CEREBRAS_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'Bolt.diy/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const res = (await response.json()) as any;
      const staticModelIds = this.staticModels.map((m) => m.name);

      const data =
        res.data?.filter((model: any) => model.object === 'model' && !staticModelIds.includes(model.id)) || [];

      return data.map((m: any) => ({
        name: m.id,
        label: `${m.id}`,
        provider: this.name,
        maxTokenAllowed: 32000, // Default context length for Cerebras models
      }));
    } catch (error) {
      console.warn(`Failed to fetch dynamic models for ${this.name}:`, error);
      return [];
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'CEREBRAS_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: baseUrl,
      apiKey,
    });

    return openai(model);
  }
}
