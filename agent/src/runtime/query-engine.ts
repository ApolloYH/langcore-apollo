import type { AgentConfig, ApprovalProvider, ContentBlock, LlmConfig, Message, ToolExecutionContext, TraceSink, WorkerConfig } from "../types.js";
import { AnthropicClient } from "../llm/anthropic.js";
import { ContextManager } from "./context.js";
import { createCliApprovalProvider } from "./permissions.js";
import { SkillManager } from "../skills/skills.js";
import { McpManager } from "../mcp/manager.js";
import { createBuiltinRegistry } from "../tools/builtin.js";
import { messageText, stringify, truncate } from "../utils.js";
import { PromptBuilder } from "./prompt-builder.js";

export type QueryEngineOptions = {
  agentConfig: AgentConfig;
  llmConfig: LlmConfig;
  emit: TraceSink;
  assumeYes?: boolean | (() => boolean);
  approvalProvider?: ApprovalProvider;
  stream?: boolean | (() => boolean);
  worker?: WorkerConfig;
  depth?: number;
};

export class QueryEngine {
  private readonly client: AnthropicClient;
  private readonly contextManager: ContextManager;
  private readonly skillManager: SkillManager;
  private readonly mcpManager: McpManager;
  private messages: Message[] = [];

  constructor(private readonly options: QueryEngineOptions) {
    this.client = new AnthropicClient(options.llmConfig);
    this.contextManager = new ContextManager(options.agentConfig.context, options.emit);
    this.skillManager = new SkillManager(options.agentConfig);
    this.mcpManager = new McpManager(options.agentConfig);
  }

  async submitMessage(input: string): Promise<string> {
    const assumeYes = typeof this.options.assumeYes === "function" ? this.options.assumeYes() : this.options.assumeYes;
    const approval = this.options.approvalProvider ?? createCliApprovalProvider(this.options.agentConfig, this.options.emit, assumeYes ?? false);
    const registry = createBuiltinRegistry({
      config: this.options.agentConfig,
      skillManager: this.skillManager,
      mcpManager: this.mcpManager,
      runWorker: (worker, workerTask, emit) => this.runWorker(worker, workerTask, emit),
    });

    const [availableSkills, matchedSkills] = await Promise.all([
      this.skillManager.metadata(),
      this.matchedSkillsForPrompt(input),
    ]);
    const prompt = new PromptBuilder({
      agentConfig: this.options.agentConfig,
      availableSkills,
      matchedSkills,
      tools: registry.definitions(),
      worker: this.options.worker,
    }).build();

    const toolContext: ToolExecutionContext = {
      workspaceRoot: this.options.agentConfig.workspaceRoot,
      emit: this.options.emit,
      requestApproval: approval,
    };

    this.messages.push({ role: "user", content: input });
    let finalText = "";
    const highRiskToolCounts = new Map<string, number>();
    const maxHighRiskCallsPerTool = assumeYes ? Number.POSITIVE_INFINITY : 3;

    try {
      for (let turn = 1; turn <= this.options.agentConfig.maxTurns; turn += 1) {
        this.messages = this.contextManager.compact(this.messages);
        const stream = typeof this.options.stream === "function" ? this.options.stream() : this.options.stream;
        this.options.emit({ type: "llm_request", turn, toolCount: registry.definitions().length });
        let lastToolDeltaAt = 0;
        let lastToolDeltaBytes = 0;
        const response = await this.client.createMessage({
          system: prompt,
          messages: this.messages,
          tools: registry.definitions(),
          stream: stream ?? true,
          onTextDelta: (text) => this.options.emit({ type: "assistant_delta", text }),
          onToolInputDelta: (event) => {
            const now = Date.now();
            if (now - lastToolDeltaAt < 1200 && event.bytes - lastToolDeltaBytes < 4000) return;
            lastToolDeltaAt = now;
            lastToolDeltaBytes = event.bytes;
            this.options.emit({ type: "llm_tool_delta", ...event });
          },
        });
        this.messages.push({ role: "assistant", content: response.content });
        finalText = messageText(response.content);
        this.options.emit({ type: "llm_response", turn, stopReason: response.stop_reason, text: truncate(finalText, 1000) });

        const toolUses = response.content.filter((block): block is Extract<ContentBlock, { type: "tool_use" }> => block.type === "tool_use");
        if (toolUses.length === 0) return finalText;

        const executeToolUse = async (toolUse: Extract<ContentBlock, { type: "tool_use" }>): Promise<ContentBlock> => {
          try {
            const risk = registry.riskOf(toolUse.name);
            if (risk === "high") {
              const count = highRiskToolCounts.get(toolUse.name) ?? 0;
              if (count >= maxHighRiskCallsPerTool) {
                const content = `High-risk tool ${toolUse.name} was already requested ${count} times in this user turn. Do not call it again for this turn. Summarize what you know, switch to a safer dedicated tool if available, or ask the user for explicit next steps.`;
                this.options.emit({ type: "tool_result", tool: toolUse.name, isError: true, content });
                return {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content,
                  is_error: true,
                };
              }
              highRiskToolCounts.set(toolUse.name, count + 1);
            }
            const result = await registry.execute(toolUse.name, toolUse.input, toolContext);
            this.options.emit({
              type: "tool_result",
              tool: toolUse.name,
              isError: result.isError,
              content: truncate(result.content, 1000),
            });
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result.content,
              is_error: result.isError,
            };
          } catch (error) {
            const content = error instanceof Error ? error.message : stringify(error);
            this.options.emit({ type: "tool_result", tool: toolUse.name, isError: true, content });
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content,
              is_error: true,
            };
          }
        };

        const toolResults = new Array<ContentBlock>(toolUses.length);
        const delegateJobs: Promise<void>[] = [];
        for (const [index, toolUse] of toolUses.entries()) {
          if (toolUse.name === "delegate_to_worker") {
            delegateJobs.push(
              executeToolUse(toolUse).then((result) => {
                toolResults[index] = result;
              }),
            );
            continue;
          }
          toolResults[index] = await executeToolUse(toolUse);
        }
        await Promise.all(delegateJobs);
        this.messages.push({ role: "user", content: toolResults });
      }
      return `Stopped: max turns reached before a final answer was completed.${finalText ? ` Last assistant text: ${finalText}` : ""}`;
    } finally {
      await this.mcpManager.closeAll();
    }
  }

  clearConversation(): void {
    this.messages = [];
    this.contextManager.clear();
  }

  private async matchedSkillsForPrompt(input: string): Promise<Array<{ content: string; name: string; path: string }>> {
    if (this.options.worker) return [];

    const matches = (await this.skillManager.search(input)).slice(0, 2);
    const loaded: Array<{ content: string; name: string; path: string }> = [];

    for (const match of matches) {
      try {
        loaded.push({
          content: await this.skillManager.read(match.path),
          name: match.name,
          path: match.path,
        });
      } catch {
        // Ignore skills that disappeared between search and read.
      }
    }

    return loaded;
  }

  private async runWorker(worker: WorkerConfig, task: string, emit: TraceSink): Promise<string> {
    const depth = this.options.depth ?? 0;
    if (depth >= 2) return "Worker delegation depth limit reached.";
    const runtime = new QueryEngine({
      ...this.options,
      emit,
      worker,
      depth: depth + 1,
    });
    return runtime.submitMessage(task);
  }
}
