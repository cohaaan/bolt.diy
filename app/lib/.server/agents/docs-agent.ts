import { BaseAgent, type AgentCallOptions, type AgentResponse } from './base-agent';
import type { AgentModelConfig, DocSnippet } from '~/lib/stores/agentState';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DocsAgent');

const DOCS_SYSTEM_PROMPT = `You are a documentation research agent. Your job is to identify what external documentation would help complete a coding task.

Given a user request:
1. Identify frameworks/libraries mentioned or implied
2. Determine which API docs would be helpful
3. Note any specific patterns or best practices needed

Output format (JSON only, no markdown):
{
  "frameworks": ["react", "tailwind"],
  "docsNeeded": [
    {"name": "React Hooks", "source": "reactjs.org", "topic": "useState, useEffect"},
    {"name": "Tailwind Classes", "source": "tailwindcss.com", "topic": "flex, grid"}
  ],
  "reasoning": "Brief explanation of why these docs are needed"
}

Be specific about what documentation would prevent hallucinations.`;

export class DocsAgent extends BaseAgent {
  constructor(modelConfig: AgentModelConfig) {
    super({
      name: 'DocsAgent',
      type: 'docs',
      modelConfig,
      systemPrompt: DOCS_SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0.3,
    });
  }

  async execute(
    userRequest: string,
    options: AgentCallOptions,
    context?: Record<string, unknown>,
  ): Promise<AgentResponse> {
    logger.info('Fetching docs for:', userRequest.substring(0, 50));

    const messages = this.buildMessages(userRequest, context);
    const response = await this.callLLM(messages, options);

    return response;
  }

  parseDocsResponse(content: string): {
    frameworks: string[];
    docsNeeded: Array<{ name: string; source: string; topic: string }>;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse docs response');
    }

    return {
      frameworks: [],
      docsNeeded: [],
    };
  }

  buildDocSnippets(parsed: {
    frameworks: string[];
    docsNeeded: Array<{ name: string; source: string; topic: string }>;
  }): DocSnippet[] {
    const docs: DocSnippet[] = [];

    for (const doc of parsed.docsNeeded) {
      docs.push({
        source: doc.source,
        title: doc.name,
        content: `[Topic: ${doc.topic}]`,
        url: `https://${doc.source}`,
      });
    }

    for (const framework of parsed.frameworks) {
      docs.push({
        source: `${framework}-docs`,
        title: `${framework} Patterns`,
        content: this.getFrameworkPatterns(framework),
      });
    }

    return docs;
  }

  private getFrameworkPatterns(framework: string): string {
    const patterns: Record<string, string> = {
      react: `React: Use functional components with hooks. useState for local state, useEffect for side effects.`,
      tailwind: `Tailwind: Use utility classes directly. Prefer flex/grid for layouts. Use responsive prefixes.`,
      typescript: `TypeScript: Define interfaces for props/state. Use type inference. Avoid 'any'.`,
      nextjs: `Next.js: Use App Router. Server Components by default. 'use client' only when needed.`,
      remix: `Remix: Use loaders for data fetching, actions for mutations. Nested routes for layouts.`,
    };

    return patterns[framework.toLowerCase()] || `[${framework} patterns]`;
  }
}

export function createDocsAgent(modelConfig: AgentModelConfig): DocsAgent {
  return new DocsAgent(modelConfig);
}
