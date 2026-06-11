export type JsonObject = Record<string, unknown>;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: JsonObject }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: JsonObject;
};

export type ToolRisk = "low" | "medium" | "high";

export type ToolDefinition = AnthropicTool & {
  risk: ToolRisk;
  execute(input: JsonObject, context: ToolExecutionContext): Promise<ToolResult>;
};

export type ToolResult = {
  content: string;
  isError?: boolean;
};

export type TraceEvent =
  | { type: "llm_request"; turn: number; toolCount: number }
  | { type: "llm_response"; turn: number; stopReason?: string; text?: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_call"; tool: string; input: JsonObject; risk: ToolRisk }
  | { type: "tool_result"; tool: string; isError?: boolean; content: string }
  | { type: "approval_required"; tool: string; risk: ToolRisk; reason: string }
  | { type: "approval_result"; tool: string; approved: boolean }
  | { type: "context_compacted"; beforeChars: number; afterChars: number }
  | { type: "worker_start"; worker: string; task: string }
  | { type: "worker_progress"; worker: string; message: string }
  | { type: "worker_finish"; worker: string; result: string };

export type TraceSink = (event: TraceEvent) => void;

export type ApprovalRequest = {
  toolName: string;
  risk: ToolRisk;
  reason: string;
  input: JsonObject;
};

export type ApprovalProvider = (request: ApprovalRequest) => Promise<boolean>;

export type ToolExecutionContext = {
  workspaceRoot: string;
  emit: TraceSink;
  requestApproval: ApprovalProvider;
};

export type LlmConfig = {
  authToken: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
};

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type WorkerConfig = {
  name: string;
  whenToUse?: string;
  tools?: string[];
  instructions: string;
};

export type AgentConfig = {
  workspaceRoot: string;
  maxTurns: number;
  context: {
    maxChars: number;
    summaryChars: number;
  };
  permissions: {
    mode: "ask" | "readonly" | "unrestricted";
    autoApproveReadOnly: boolean;
  };
  skills: {
    directories: string[];
  };
  mcpServers: Record<string, McpServerConfig>;
  workers: WorkerConfig[];
};
