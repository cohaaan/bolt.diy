import { createScopedLogger } from '~/utils/logger';
import type { AgentContext, OrchestratorConfig, SearchResult, DocSnippet } from '~/lib/stores/agentState';
import { createSearchAgent, SearchAgent } from './search-agent';
import { createDocsAgent, DocsAgent } from './docs-agent';
import { createOracleAgent, OracleAgent } from './oracle-agent';
import type { AgentCallOptions, AgentResponse } from './base-agent';

const logger = createScopedLogger('AgentRouter');

export interface PipelineResult {
  success: boolean;
  searchResults: SearchResult[];
  externalDocs: DocSnippet[];
  responses: Array<{ agent: string; response: AgentResponse }>;
  oracleAnalysis?: {
    rootCause: string;
    fixStrategy: { steps: Array<{ action: string; file: string; change: string }>; reasoning: string };
    confidence: number;
  };
  supplementalContext: string;
  error?: string;
}

export class AgentRouter {
  private searchAgent: SearchAgent | null = null;
  private docsAgent: DocsAgent | null = null;
  private oracleAgent: OracleAgent | null = null;

  async runPipeline(
    userRequest: string,
    config: OrchestratorConfig,
    options: AgentCallOptions,
    errorHistory?: Array<{ error: string; attemptedFix: string; timestamp: number }>,
  ): Promise<PipelineResult> {
    const responses: Array<{ agent: string; response: AgentResponse }> = [];
    let searchResults: SearchResult[] = [];
    let externalDocs: DocSnippet[] = [];

    try {
      // Rush Mode: Skip Search/Docs, go straight to builder context
      if (config.isRushMode) {
        logger.info('Rush Mode: Skipping Search and Docs agents');

        return {
          success: true,
          searchResults: [],
          externalDocs: [],
          responses: [],
          supplementalContext: '',
        };
      }

      // Check if we should invoke Oracle (after multiple failures)
      const failureCount = errorHistory?.length || 0;

      if (failureCount >= config.useOracleAfterFailures) {
        logger.info(`Invoking Oracle after ${failureCount} failures`);

        this.oracleAgent = createOracleAgent(config.oracleAgent);
        const oracleResponse = await this.oracleAgent.execute(userRequest, options, {
          errorHistory,
        });

        responses.push({ agent: 'oracle', response: oracleResponse });

        const analysis = this.oracleAgent.parseOracleResponse(oracleResponse.content);

        return {
          success: true,
          searchResults: [],
          externalDocs: [],
          responses,
          oracleAnalysis: analysis,
          supplementalContext: this.buildOracleContext(analysis),
        };
      }

      // Step 1: Search Agent
      if (config.useSearchAgent) {
        logger.info('Running SearchAgent');
        this.searchAgent = createSearchAgent(config.searchAgent);

        const searchResponse = await this.searchAgent.execute(userRequest, options);
        responses.push({ agent: 'search', response: searchResponse });

        const parsed = this.searchAgent.parseSearchResponse(searchResponse.content);
        searchResults = this.searchAgent.buildSearchResults(parsed);
      }

      // Step 2: Docs Agent
      if (config.useDocsAgent) {
        logger.info('Running DocsAgent');
        this.docsAgent = createDocsAgent(config.docsAgent);

        const docsResponse = await this.docsAgent.execute(userRequest, options, {
          searchResults,
        });
        responses.push({ agent: 'docs', response: docsResponse });

        const parsed = this.docsAgent.parseDocsResponse(docsResponse.content);
        externalDocs = this.docsAgent.buildDocSnippets(parsed);
      }

      // Build supplemental context for Builder
      const supplementalContext = this.buildSupplementalContext(searchResults, externalDocs, errorHistory);

      return {
        success: true,
        searchResults,
        externalDocs,
        responses,
        supplementalContext,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Pipeline failed:', errorMsg);

      return {
        success: false,
        searchResults,
        externalDocs,
        responses,
        supplementalContext: '',
        error: errorMsg,
      };
    }
  }

  private buildSupplementalContext(
    searchResults: SearchResult[],
    externalDocs: DocSnippet[],
    errorHistory?: Array<{ error: string; attemptedFix: string; timestamp: number }>,
  ): string {
    const parts: string[] = [];

    if (searchResults.length > 0) {
      parts.push('<relevant_files>');

      for (const result of searchResults.slice(0, 10)) {
        parts.push(`- ${result.filePath}`);
      }

      parts.push('</relevant_files>');
    }

    if (externalDocs.length > 0) {
      parts.push('<framework_documentation>');

      for (const doc of externalDocs) {
        parts.push(`## ${doc.title}`);
        parts.push(doc.content);
        parts.push('');
      }

      parts.push('</framework_documentation>');
    }

    if (errorHistory && errorHistory.length > 0) {
      parts.push('<previous_errors>');

      for (const entry of errorHistory.slice(-3)) {
        parts.push(`- ${entry.error}`);
      }

      parts.push('</previous_errors>');
    }

    return parts.join('\n');
  }

  private buildOracleContext(analysis: {
    rootCause: string;
    fixStrategy: { steps: Array<{ action: string; file: string; change: string }>; reasoning: string };
    confidence: number;
  }): string {
    const parts: string[] = [];

    parts.push('<oracle_analysis>');
    parts.push(`Root Cause: ${analysis.rootCause}`);
    parts.push(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    parts.push('');
    parts.push('Fix Strategy:');

    for (const step of analysis.fixStrategy.steps) {
      parts.push(`- ${step.action} ${step.file}: ${step.change}`);
    }

    parts.push('');
    parts.push(`Reasoning: ${analysis.fixStrategy.reasoning}`);
    parts.push('</oracle_analysis>');

    return parts.join('\n');
  }
}

export function createAgentRouter(): AgentRouter {
  return new AgentRouter();
}
