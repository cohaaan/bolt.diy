import { BaseAgent, type AgentCallOptions, type AgentResponse } from './base-agent';
import type { AgentModelConfig, SearchResult } from '~/lib/stores/agentState';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SearchAgent');

const SEARCH_SYSTEM_PROMPT = `You are a specialized file search agent. Your job is to quickly find relevant files in a codebase.

Given a user request, identify:
1. Which files are likely relevant
2. What patterns to search for
3. Key directories to explore

Output format (JSON only, no markdown):
{
  "searchPatterns": ["pattern1", "pattern2"],
  "likelyFiles": ["path/to/file.ts"],
  "directories": ["src/", "lib/"],
  "reasoning": "Brief explanation of why these are relevant"
}

Be fast and efficient. Don't over-explain. Focus on finding the right files.`;

export class SearchAgent extends BaseAgent {
  constructor(modelConfig: AgentModelConfig) {
    super({
      name: 'SearchAgent',
      type: 'search',
      modelConfig,
      systemPrompt: SEARCH_SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.3,
    });
  }

  async execute(
    userRequest: string,
    options: AgentCallOptions,
    context?: Record<string, unknown>,
  ): Promise<AgentResponse> {
    logger.info('Executing search for:', userRequest.substring(0, 50));

    const messages = this.buildMessages(userRequest, context);
    const response = await this.callLLM(messages, options);

    return response;
  }

  parseSearchResponse(content: string): {
    searchPatterns: string[];
    likelyFiles: string[];
    directories: string[];
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse search response');
    }

    return {
      searchPatterns: [],
      likelyFiles: [],
      directories: ['app/', 'src/'],
    };
  }

  buildSearchResults(parsed: {
    searchPatterns: string[];
    likelyFiles: string[];
    directories: string[];
  }): SearchResult[] {
    const results: SearchResult[] = [];

    for (const file of parsed.likelyFiles) {
      results.push({
        filePath: file,
        snippet: '',
        relevance: 1.0,
      });
    }

    for (const pattern of parsed.searchPatterns) {
      results.push({
        filePath: `[pattern: ${pattern}]`,
        snippet: `Search for: ${pattern}`,
        relevance: 0.8,
      });
    }

    return results;
  }
}

export function createSearchAgent(modelConfig: AgentModelConfig): SearchAgent {
  return new SearchAgent(modelConfig);
}
