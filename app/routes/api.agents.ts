import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createAgentRouter } from '~/lib/.server/agents/agent-router';
import type { OrchestratorConfig } from '~/lib/stores/agentState';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.agents');

export async function action({ request, context }: ActionFunctionArgs) {
  const body = await request.json<{
    userRequest: string;
    config: OrchestratorConfig;
    errorHistory?: Array<{ error: string; attemptedFix: string; timestamp: number }>;
  }>();

  const { userRequest, config, errorHistory } = body;

  if (!userRequest) {
    return json({ error: 'userRequest is required' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  logger.info(`Running agent pipeline for request: ${userRequest.substring(0, 50)}...`);

  const router = createAgentRouter();

  const result = await router.runPipeline(userRequest, config, {
    apiKeys,
    providerSettings,
    serverEnv: context.cloudflare?.env as unknown as Record<string, string>,
  }, errorHistory);

  if (!result.success) {
    logger.error('Agent pipeline failed:', result.error);

    return json({ error: result.error }, { status: 500 });
  }

  logger.info(`Agent pipeline completed with ${result.responses.length} responses`);

  return json({
    success: true,
    searchResults: result.searchResults,
    externalDocs: result.externalDocs,
    responses: result.responses.map((r) => ({
      agent: r.agent,
      model: r.response.model,
      provider: r.response.provider,
      duration: r.response.duration,
      tokenCount: r.response.tokenCount,
    })),
    oracleAnalysis: result.oracleAnalysis,
    supplementalContext: result.supplementalContext,
  });
}
