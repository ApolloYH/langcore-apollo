import { loadAgentConfig, loadEnvFile, loadLlmConfig } from "./config.js";
import { QueryEngine, type QueryEngineOptions } from "./runtime/query-engine.js";
import type { AgentConfig, ApprovalProvider, LlmConfig, TraceEvent, TraceSink } from "./types.js";

export type CreateQueryEngineOptions = {
  configPath?: string;
  agentConfig?: AgentConfig;
  llmConfig?: LlmConfig;
  assumeYes?: boolean | (() => boolean);
  approvalProvider?: ApprovalProvider;
  stream?: boolean | (() => boolean);
  onEvent?: TraceSink;
};

export type RunAgentTurnOptions = CreateQueryEngineOptions & {
  input: string;
};

export type RunAgentTurnResult = {
  text: string;
};

export async function createQueryEngine(options: CreateQueryEngineOptions = {}): Promise<QueryEngine> {
  loadEnvFile();
  const agentConfig = options.agentConfig ?? (await loadAgentConfig(options.configPath));
  const llmConfig = options.llmConfig ?? loadLlmConfig();
  return new QueryEngine({
    agentConfig,
    llmConfig,
    emit: options.onEvent ?? noopTraceSink,
    assumeYes: options.assumeYes,
    approvalProvider: options.approvalProvider,
    stream: options.stream,
  });
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<RunAgentTurnResult> {
  const engine = await createQueryEngine(options);
  const text = await engine.submitMessage(options.input);
  return { text };
}

function noopTraceSink(_event: TraceEvent): void {}

export { QueryEngine, type QueryEngineOptions };
export { PromptBuilder } from "./runtime/prompt-builder.js";
export { ToolPolicy } from "./runtime/tool-policy.js";
export type { AgentConfig, AnthropicTool, ApprovalProvider, LlmConfig, Message, ToolDefinition, ToolResult, TraceEvent } from "./types.js";
