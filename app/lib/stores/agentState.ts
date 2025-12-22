import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AgentStateStore');

export type AgentType = 'search' | 'docs' | 'builder' | 'oracle' | 'testing';

export interface SearchResult {
  filePath: string;
  snippet: string;
  relevance: number;
  lineNumbers?: { start: number; end: number };
}

export interface DocSnippet {
  source: string;
  title: string;
  content: string;
  url?: string;
}

export interface AgentExecution {
  id: string;
  agent: AgentType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  input?: string;
  output?: string;
  error?: string;
  tokenCount?: number;
}

export interface AgentContext {
  userRequest: string;
  searchResults: SearchResult[];
  externalDocs: DocSnippet[];
  projectContext: {
    specPath?: string;
    skillsPaths?: string[];
  };
  errorHistory: Array<{
    error: string;
    attemptedFix: string;
    timestamp: number;
  }>;
  currentPhase: 'search' | 'docs' | 'build' | 'test' | 'oracle' | 'complete';
}

export interface AgentModelConfig {
  provider: string;
  model: string;
}

export interface OrchestratorConfig {
  enabled: boolean;
  isRushMode: boolean;
  useSearchAgent: boolean;
  useDocsAgent: boolean;
  useOracleAfterFailures: number;
  // Provider-agnostic: user picks any provider/model per agent
  searchAgent: AgentModelConfig;
  docsAgent: AgentModelConfig;
  builderAgent: AgentModelConfig;
  oracleAgent: AgentModelConfig;
  // Rush mode uses a single fast model for everything
  rushAgent: AgentModelConfig;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  enabled: true,
  isRushMode: false,
  useSearchAgent: true,
  useDocsAgent: true,
  useOracleAfterFailures: 3,
  // Defaults - user can change to ANY provider (OpenAI, Ollama, Google, etc.)
  searchAgent: { provider: 'Anthropic', model: 'claude-3-haiku-20240307' },
  docsAgent: { provider: 'Anthropic', model: 'claude-3-haiku-20240307' },
  builderAgent: { provider: 'Anthropic', model: 'claude-sonnet-4-20250514' },
  oracleAgent: { provider: 'Anthropic', model: 'claude-sonnet-4-20250514' },
  rushAgent: { provider: 'Anthropic', model: 'claude-3-haiku-20240307' },
};

class AgentStateStore {
  config = atom<OrchestratorConfig>(DEFAULT_CONFIG);
  currentContext = atom<AgentContext | null>(null);
  executionHistory = map<Record<string, AgentExecution>>({});
  activeAgent = atom<AgentType | null>(null);
  failureCount = atom<number>(0);

  initContext(userRequest: string): AgentContext {
    const context: AgentContext = {
      userRequest,
      searchResults: [],
      externalDocs: [],
      projectContext: {},
      errorHistory: [],
      currentPhase: 'search',
    };
    this.currentContext.set(context);
    this.failureCount.set(0);
    logger.info('Initialized agent context for request');
    return context;
  }

  updateContext(updates: Partial<AgentContext>) {
    const current = this.currentContext.get();

    if (current) {
      this.currentContext.set({ ...current, ...updates });
    }
  }

  addSearchResults(results: SearchResult[]) {
    const current = this.currentContext.get();

    if (current) {
      this.currentContext.set({
        ...current,
        searchResults: [...current.searchResults, ...results],
      });
    }
  }

  addDocs(docs: DocSnippet[]) {
    const current = this.currentContext.get();

    if (current) {
      this.currentContext.set({
        ...current,
        externalDocs: [...current.externalDocs, ...docs],
      });
    }
  }

  recordError(error: string, attemptedFix: string) {
    const current = this.currentContext.get();

    if (current) {
      this.currentContext.set({
        ...current,
        errorHistory: [
          ...current.errorHistory,
          { error, attemptedFix, timestamp: Date.now() },
        ],
      });
      this.failureCount.set(this.failureCount.get() + 1);
    }
  }

  startExecution(agent: AgentType, input?: string): string {
    const id = `exec-${Date.now()}-${agent}`;
    const execution: AgentExecution = {
      id,
      agent,
      status: 'running',
      startTime: Date.now(),
      input,
    };
    this.executionHistory.setKey(id, execution);
    this.activeAgent.set(agent);
    logger.info(`Started ${agent} agent execution: ${id}`);
    return id;
  }

  completeExecution(id: string, output: string, tokenCount?: number) {
    const execution = this.executionHistory.get()[id];

    if (execution) {
      this.executionHistory.setKey(id, {
        ...execution,
        status: 'completed',
        endTime: Date.now(),
        output,
        tokenCount,
      });
      this.activeAgent.set(null);
      logger.info(`Completed execution: ${id}`);
    }
  }

  failExecution(id: string, error: string) {
    const execution = this.executionHistory.get()[id];

    if (execution) {
      this.executionHistory.setKey(id, {
        ...execution,
        status: 'failed',
        endTime: Date.now(),
        error,
      });
      this.activeAgent.set(null);
      logger.error(`Failed execution: ${id}`, error);
    }
  }

  shouldUseOracle(): boolean {
    const config = this.config.get();
    return this.failureCount.get() >= config.useOracleAfterFailures;
  }

  updateConfig(updates: Partial<OrchestratorConfig>) {
    this.config.set({ ...this.config.get(), ...updates });
    logger.info('Updated orchestrator config');
  }

  reset() {
    this.currentContext.set(null);
    this.executionHistory.set({});
    this.activeAgent.set(null);
    this.failureCount.set(0);
    logger.info('Reset agent state');
  }

  getExecutionStats(): {
    totalExecutions: number;
    byAgent: Record<AgentType, number>;
    averageDuration: number;
    totalTokens: number;
  } {
    const executions = Object.values(this.executionHistory.get());
    const byAgent: Record<AgentType, number> = {
      search: 0,
      docs: 0,
      builder: 0,
      oracle: 0,
      testing: 0,
    };

    let totalDuration = 0;
    let totalTokens = 0;
    let completedCount = 0;

    for (const exec of executions) {
      byAgent[exec.agent]++;

      if (exec.status === 'completed' && exec.endTime) {
        totalDuration += exec.endTime - exec.startTime;
        completedCount++;
      }

      if (exec.tokenCount) {
        totalTokens += exec.tokenCount;
      }
    }

    return {
      totalExecutions: executions.length,
      byAgent,
      averageDuration: completedCount > 0 ? totalDuration / completedCount : 0,
      totalTokens,
    };
  }
}

export const agentStateStore = new AgentStateStore();
