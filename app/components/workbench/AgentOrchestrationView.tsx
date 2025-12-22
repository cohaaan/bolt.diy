import { memo } from 'react';
import { useStore } from '@nanostores/react';
import { agentStateStore, type AgentExecution, type AgentType } from '~/lib/stores/agentState';
import { classNames } from '~/utils/classNames';

interface AgentStepProps {
  execution: AgentExecution;
}

const AGENT_CONFIG: Record<AgentType, { icon: string; label: string; color: string }> = {
  search: {
    icon: 'i-ph:magnifying-glass',
    label: 'Search',
    color: 'text-blue-500',
  },
  docs: {
    icon: 'i-ph:book-open',
    label: 'Docs',
    color: 'text-purple-500',
  },
  builder: {
    icon: 'i-ph:hammer',
    label: 'Builder',
    color: 'text-green-500',
  },
  oracle: {
    icon: 'i-ph:brain',
    label: 'Oracle',
    color: 'text-orange-500',
  },
  testing: {
    icon: 'i-ph:flask',
    label: 'Testing',
    color: 'text-cyan-500',
  },
};

const AgentStep = memo(({ execution }: AgentStepProps) => {
  const config = AGENT_CONFIG[execution.agent];
  const duration = execution.endTime ? execution.endTime - execution.startTime : null;

  return (
    <div
      className={classNames(
        'flex items-center gap-3 p-3 rounded-lg',
        'bg-bolt-elements-background-depth-2',
        'border border-bolt-elements-borderColor',
        execution.status === 'running' && 'border-bolt-elements-focus',
      )}
    >
      <div
        className={classNames(
          'w-8 h-8 rounded-full flex items-center justify-center',
          execution.status === 'completed' && 'bg-green-500/20',
          execution.status === 'running' && 'bg-blue-500/20 animate-pulse',
          execution.status === 'failed' && 'bg-red-500/20',
          execution.status === 'pending' && 'bg-bolt-elements-background-depth-3',
        )}
      >
        <div className={classNames(config.icon, 'w-4 h-4', config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textPrimary">{config.label}</span>
          {execution.status === 'running' && (
            <span className="text-xs text-bolt-elements-textTertiary">Running...</span>
          )}
          {execution.status === 'completed' && duration && (
            <span className="text-xs text-bolt-elements-textTertiary">{duration}ms</span>
          )}
          {execution.status === 'failed' && (
            <span className="text-xs text-red-500">Failed</span>
          )}
        </div>
        {execution.tokenCount && (
          <div className="text-xs text-bolt-elements-textTertiary">{execution.tokenCount} tokens</div>
        )}
      </div>

      <div>
        {execution.status === 'completed' && <div className="i-ph:check-circle w-5 h-5 text-green-500" />}
        {execution.status === 'running' && <div className="i-ph:circle-notch w-5 h-5 text-blue-500 animate-spin" />}
        {execution.status === 'failed' && <div className="i-ph:x-circle w-5 h-5 text-red-500" />}
        {execution.status === 'pending' && <div className="i-ph:circle w-5 h-5 text-bolt-elements-textTertiary" />}
      </div>
    </div>
  );
});

AgentStep.displayName = 'AgentStep';

export const AgentOrchestrationView = memo(() => {
  const config = useStore(agentStateStore.config);
  const context = useStore(agentStateStore.currentContext);
  const executionHistory = useStore(agentStateStore.executionHistory);
  const activeAgent = useStore(agentStateStore.activeAgent);
  const failureCount = useStore(agentStateStore.failureCount);

  const executions = Object.values(executionHistory).sort((a, b) => a.startTime - b.startTime);
  const hasActivity = executions.length > 0 || activeAgent !== null;

  if (!config.enabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-bolt-elements-background-depth-1 border-t border-bolt-elements-borderColor">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="i-ph:robot w-5 h-5 text-bolt-elements-textSecondary" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Agent Pipeline</span>
        </div>

        <div className="flex items-center gap-2">
          {config.isRushMode ? (
            <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-500">Rush</span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-500">Smart</span>
          )}

          {failureCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-500">
              {failureCount} {failureCount === 1 ? 'failure' : 'failures'}
            </span>
          )}
        </div>
      </div>

      {context?.currentPhase && (
        <div className="text-xs text-bolt-elements-textTertiary">
          Phase: <span className="capitalize">{context.currentPhase}</span>
        </div>
      )}

      {hasActivity ? (
        <div className="flex flex-col gap-2">
          {executions.map((execution) => (
            <AgentStep key={execution.id} execution={execution} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-bolt-elements-textTertiary text-center py-4">
          Waiting for activity...
        </div>
      )}

      {context?.searchResults && context.searchResults.length > 0 && (
        <div className="mt-2 p-2 rounded bg-bolt-elements-background-depth-2">
          <div className="text-xs font-medium text-bolt-elements-textSecondary mb-1">
            Found {context.searchResults.length} relevant files
          </div>
          <div className="text-xs text-bolt-elements-textTertiary max-h-20 overflow-y-auto">
            {context.searchResults.slice(0, 5).map((r, i) => (
              <div key={i} className="truncate">{r.filePath}</div>
            ))}
          </div>
        </div>
      )}

      {context?.externalDocs && context.externalDocs.length > 0 && (
        <div className="mt-2 p-2 rounded bg-bolt-elements-background-depth-2">
          <div className="text-xs font-medium text-bolt-elements-textSecondary mb-1">
            Loaded {context.externalDocs.length} doc snippets
          </div>
          <div className="text-xs text-bolt-elements-textTertiary">
            {context.externalDocs.map((d) => d.title).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
});

AgentOrchestrationView.displayName = 'AgentOrchestrationView';
