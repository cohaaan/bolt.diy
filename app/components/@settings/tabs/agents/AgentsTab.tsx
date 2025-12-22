import { memo, useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { agentStateStore, type AgentModelConfig, type OrchestratorConfig } from '~/lib/stores/agentState';
import { PROVIDER_LIST } from '~/utils/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';

const AgentModelSelector = memo(
  ({
    label,
    agentKey,
    config,
    models,
    onUpdate,
  }: {
    label: string;
    agentKey: keyof Pick<OrchestratorConfig, 'searchAgent' | 'docsAgent' | 'builderAgent' | 'oracleAgent' | 'rushAgent'>;
    config: AgentModelConfig;
    models: ModelInfo[];
    onUpdate: (key: string, value: AgentModelConfig) => void;
  }) => {
    const providers = PROVIDER_LIST.map((p) => p.name);
    const providerModels = models.filter((m) => m.provider === config.provider);

    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-bolt-elements-background-depth-2">
        <label className="text-sm font-medium text-bolt-elements-textPrimary">{label}</label>
        <div className="flex gap-2">
          <select
            value={config.provider}
            onChange={(e) => {
              const newProvider = e.target.value;
              const newModels = models.filter((m) => m.provider === newProvider);
              onUpdate(agentKey, {
                provider: newProvider,
                model: newModels[0]?.name || '',
              });
            }}
            className="flex-1 p-2 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={config.model}
            onChange={(e) => onUpdate(agentKey, { ...config, model: e.target.value })}
            className="flex-1 p-2 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
          >
            {providerModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label || m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  },
);

AgentModelSelector.displayName = 'AgentModelSelector';

export const AgentsTab = memo(() => {
  const config = useStore(agentStateStore.config);
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    const llmManager = LLMManager.getInstance();
    setModels(llmManager.getModelList());
  }, []);

  const handleToggle = useCallback((key: keyof OrchestratorConfig, value: boolean) => {
    agentStateStore.updateConfig({ [key]: value });
    toast.success(`${key} ${value ? 'enabled' : 'disabled'}`);
  }, []);

  const handleModelUpdate = useCallback((key: string, value: AgentModelConfig) => {
    agentStateStore.updateConfig({ [key]: value } as Partial<OrchestratorConfig>);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Agent Orchestration</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          Configure the multi-agent pipeline for enhanced code generation.
        </p>
      </div>

      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background-depth-2">
        <div>
          <div className="font-medium text-bolt-elements-textPrimary">Enable Agent Pipeline</div>
          <div className="text-sm text-bolt-elements-textTertiary">
            Use specialized agents for search, docs, and deep reasoning
          </div>
        </div>
        <button
          onClick={() => handleToggle('enabled', !config.enabled)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            config.enabled ? 'bg-green-500' : 'bg-bolt-elements-background-depth-3'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              config.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Rush vs Smart Mode */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background-depth-2">
        <div>
          <div className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
            {config.isRushMode ? (
              <>
                <span className="i-ph:lightning w-5 h-5 text-orange-500" />
                Rush Mode
              </>
            ) : (
              <>
                <span className="i-ph:brain w-5 h-5 text-blue-500" />
                Smart Mode
              </>
            )}
          </div>
          <div className="text-sm text-bolt-elements-textTertiary">
            {config.isRushMode
              ? 'Fast edits - skips Search & Docs agents'
              : 'Full pipeline - Search → Docs → Build → Test'}
          </div>
        </div>
        <button
          onClick={() => handleToggle('isRushMode', !config.isRushMode)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            config.isRushMode
              ? 'bg-orange-500/20 text-orange-500 hover:bg-orange-500/30'
              : 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30'
          }`}
        >
          {config.isRushMode ? 'Switch to Smart' : 'Switch to Rush'}
        </button>
      </div>

      {/* Agent Toggles */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-bolt-elements-background-depth-2">
          <div className="flex items-center gap-2">
            <span className="i-ph:magnifying-glass w-5 h-5 text-blue-500" />
            <span className="text-sm text-bolt-elements-textPrimary">Search Agent</span>
          </div>
          <button
            onClick={() => handleToggle('useSearchAgent', !config.useSearchAgent)}
            disabled={config.isRushMode}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              config.useSearchAgent && !config.isRushMode
                ? 'bg-green-500'
                : 'bg-bolt-elements-background-depth-3'
            } ${config.isRushMode ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                config.useSearchAgent && !config.isRushMode ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-bolt-elements-background-depth-2">
          <div className="flex items-center gap-2">
            <span className="i-ph:book-open w-5 h-5 text-purple-500" />
            <span className="text-sm text-bolt-elements-textPrimary">Docs Agent</span>
          </div>
          <button
            onClick={() => handleToggle('useDocsAgent', !config.useDocsAgent)}
            disabled={config.isRushMode}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              config.useDocsAgent && !config.isRushMode
                ? 'bg-green-500'
                : 'bg-bolt-elements-background-depth-3'
            } ${config.isRushMode ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                config.useDocsAgent && !config.isRushMode ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Oracle Settings */}
      <div className="p-4 rounded-lg bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="i-ph:brain w-5 h-5 text-orange-500" />
          <span className="font-medium text-bolt-elements-textPrimary">Oracle (Doom Loop Breaker)</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-bolt-elements-textSecondary">Invoke after</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.useOracleAfterFailures}
            onChange={(e) =>
              agentStateStore.updateConfig({ useOracleAfterFailures: parseInt(e.target.value) || 3 })
            }
            className="w-16 p-2 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor text-center"
          />
          <label className="text-sm text-bolt-elements-textSecondary">failures</label>
        </div>
      </div>

      {/* Model Selection */}
      {config.enabled && (
        <div className="flex flex-col gap-3">
          <h4 className="font-medium text-bolt-elements-textPrimary">Agent Models</h4>
          <p className="text-xs text-bolt-elements-textTertiary">
            Choose any provider/model for each agent role. Fast models (Haiku, GPT-4o-mini) recommended for
            Search/Docs.
          </p>

          {!config.isRushMode && (
            <>
              <AgentModelSelector
                label="Search Agent (fast/cheap)"
                agentKey="searchAgent"
                config={config.searchAgent}
                models={models}
                onUpdate={handleModelUpdate}
              />
              <AgentModelSelector
                label="Docs Agent (fast/cheap)"
                agentKey="docsAgent"
                config={config.docsAgent}
                models={models}
                onUpdate={handleModelUpdate}
              />
            </>
          )}

          <AgentModelSelector
            label={config.isRushMode ? 'Rush Agent (fast)' : 'Builder Agent (main)'}
            agentKey={config.isRushMode ? 'rushAgent' : 'builderAgent'}
            config={config.isRushMode ? config.rushAgent : config.builderAgent}
            models={models}
            onUpdate={handleModelUpdate}
          />

          <AgentModelSelector
            label="Oracle Agent (deep reasoning)"
            agentKey="oracleAgent"
            config={config.oracleAgent}
            models={models}
            onUpdate={handleModelUpdate}
          />
        </div>
      )}
    </div>
  );
});

AgentsTab.displayName = 'AgentsTab';
