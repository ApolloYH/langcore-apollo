import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApprovalRequest } from "./approvals";

type JsonObject = Record<string, unknown>;

type ApprovalRequest = {
  toolName: string;
  risk: "low" | "medium" | "high";
  reason: string;
  input: JsonObject;
};

type AgentTraceEvent =
  | { type: "llm_request"; turn: number; toolCount: number }
  | { type: "llm_response"; turn: number; stopReason?: string; text?: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_call"; tool: string; input: JsonObject; risk: "low" | "medium" | "high" }
  | { type: "tool_result"; tool: string; isError?: boolean; content: string }
  | { type: "approval_required"; tool: string; risk: "low" | "medium" | "high"; reason: string }
  | { type: "approval_result"; tool: string; approved: boolean }
  | { type: "context_compacted"; beforeChars: number; afterChars: number }
  | { type: "worker_start"; worker: string; task: string }
  | { type: "worker_progress"; worker: string; message: string }
  | { type: "worker_finish"; worker: string; result: string };

type AgentSdkModule = {
  createQueryEngine(options: {
    agentConfig?: Record<string, unknown>;
    approvalProvider?: (request: ApprovalRequest) => Promise<boolean>;
    assumeYes?: boolean;
    configPath?: string;
    onEvent?: (event: AgentTraceEvent) => void;
    stream?: boolean;
  }): Promise<{
    submitMessage(input: string): Promise<string>;
  }>;
};

type AgentConfigModule = {
  loadEnvFile(envPath?: string): boolean;
};

type ChatRequest = {
  autoApprove?: boolean;
  message?: string;
  mode?: "quick" | "deep";
  model?: string;
};

export type ThoughtStep = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "running" | "waiting";
};

type ChatStreamEvent =
  | { type: "start"; id: string; model: string }
  | { type: "thought"; thought: ThoughtStep }
  | { type: "approval"; approval: FrontendApprovalRequest }
  | { type: "delta"; text: string }
  | { type: "done"; id: string; model: string; content: string }
  | { type: "error"; error: string };

type FrontendApprovalRequest = {
  id: string;
  tool: string;
  risk: "low" | "medium" | "high";
  reason: string;
  input: string;
  status?: "pending" | "approved" | "denied";
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequest;
  const message = body.message?.trim();

  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      headers: { "content-type": "application/json; charset=utf-8" },
      status: 400,
    });
  }

  const model = body.model || "langcore-agent";
  const mode = body.mode === "quick" ? "quick" : "deep";
  const autoApprove = body.autoApprove === true;
  const assistantId = `assistant-${Date.now()}`;
  const encoder = new TextEncoder();
  const turnStartedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({ type: "start", id: assistantId, model });

        const agentRoot = path.resolve(process.cwd(), "..", "agent");
        const agentConfigPath = path.join(agentRoot, "agent.config.example.json");
        const [sdk, configModule] = await Promise.all([
          importRuntimeModule<AgentSdkModule>(path.join(agentRoot, "dist", "sdk.js")),
          importRuntimeModule<AgentConfigModule>(path.join(agentRoot, "dist", "config.js")),
        ]);

        configModule.loadEnvFile(path.join(agentRoot, ".env"));
        const agentConfig = await loadModeAgentConfig(agentConfigPath, mode);
        let thoughtStartedAt = 0;
        let thoughtCompleted = false;
        const finishThought = (detail: string) => {
          if (!thoughtStartedAt || thoughtCompleted) {
            return;
          }

          const elapsed = ((Date.now() - thoughtStartedAt) / 1000).toFixed(1);
          thoughtCompleted = true;
          send({
            type: "thought",
            thought: {
              id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title: `Thought ${elapsed}s`,
              detail,
              status: "done",
            },
          });
        };

        const engine = await sdk.createQueryEngine({
          agentConfig,
          assumeYes: false,
          stream: true,
          approvalProvider: async (approvalRequest: ApprovalRequest) => {
            if (autoApprove) {
              return true;
            }

                const approval = createApprovalRequest();
                send({
                  type: "approval",
                  approval: {
                    id: approval.id,
                    tool: approvalRequest.toolName,
                    risk: approvalRequest.risk,
                    reason: approvalRequest.reason,
                    input: compactApprovalInput(approvalRequest),
                  },
                });
                send({
                  type: "thought",
                  thought: {
                    id: `approval-wait-${approval.id}`,
                    title: `等待审批 ${approvalRequest.toolName}`,
                    detail: `${approvalRequest.risk} risk ${approvalRequest.reason}`,
                    status: "waiting",
                  },
                });
                const approved = await approval.promise;
                send({
                  type: "thought",
                  thought: {
                    id: `approval-done-${approval.id}`,
                    title: `${approvalRequest.toolName} ${approved ? "已批准" : "已拒绝"}`,
                    detail: "前端审批决策已返回",
                    status: approved ? "done" : "waiting",
                  },
                });
                return approved;
          },
          onEvent(event) {
            if (event.type === "llm_request") {
              thoughtStartedAt = Date.now();
              thoughtCompleted = false;
              return;
            }

            if (event.type === "assistant_delta") {
              finishThought("receiving direct answer");
              send({ type: "delta", text: event.text });
              return;
            }

            if (event.type === "llm_response") {
              finishThought(thoughtDetail(event.stopReason));
              return;
            }

            const thought = traceToThought(event);
            if (thought) {
              send({ type: "thought", thought });
            }
          },
        });

        const content = await engine.submitMessage(message);
        send({
          type: "thought",
          thought: {
            id: `completed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: `Completed in ${elapsedSince(turnStartedAt)}`,
            detail: "",
            status: "done",
          },
        });
        send({ type: "done", id: assistantId, model, content });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

function traceToThought(event: Exclude<AgentTraceEvent, { type: "assistant_delta" }>): ThoughtStep | null {
  const id = `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  switch (event.type) {
    case "llm_request":
    case "llm_response":
      return null;
    case "tool_call":
      return {
        id,
        title: `调用工具 ${event.tool}`,
        detail: `${event.risk} risk ${compact(event.input, 220)}`,
        status: "running",
      };
    case "tool_result":
      return {
        id,
        title: `${event.tool} ${event.isError ? "失败" : "完成"}`,
        detail: compact(event.content, 260),
        status: event.isError ? "waiting" : "done",
      };
    case "approval_required":
      return {
        id,
        title: `等待审批 ${event.tool}`,
        detail: `${event.risk} risk ${event.reason}`,
        status: "waiting",
      };
    case "approval_result":
      return {
        id,
        title: `${event.tool} ${event.approved ? "已批准" : "已拒绝"}`,
        detail: "权限决策已记录",
        status: event.approved ? "done" : "waiting",
      };
    case "context_compacted":
      return {
        id,
        title: "上下文已压缩",
        detail: `${event.beforeChars} chars -> ${event.afterChars} chars`,
        status: "done",
      };
    case "worker_start":
      return {
        id,
        title: `启动 worker ${event.worker}`,
        detail: compact(event.task, 240),
        status: "running",
      };
    case "worker_progress":
      return {
        id,
        title: `${event.worker} 进展`,
        detail: compact(event.message, 240),
        status: "running",
      };
    case "worker_finish":
      return {
        id,
        title: `${event.worker} 完成`,
        detail: compact(event.result, 280),
        status: "done",
      };
    default:
      return null;
  }
}

function compact(value: unknown, maxChars: number) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const text = (raw || "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function compactApprovalInput(request: ApprovalRequest) {
  const input = request.toolName === "delegate_to_worker" ? compactDelegateInput(request.input) : request.input;
  return compact(input, 800);
}

function elapsedSince(startedAt: number) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function thoughtDetail(stopReason?: string) {
  if (stopReason === "tool_use") return "model requested tool use";
  if (stopReason === "max_tokens") return "model reached max token limit";
  if (stopReason === "end_turn") return "receiving direct answer";
  return stopReason ? `stopped by ${stopReason}` : "model response received";
}

function compactDelegateInput(input: ApprovalRequest["input"]) {
  const task = typeof input.task === "string" ? input.task.replace(/\s+/g, " ").trim() : undefined;

  return {
    worker: input.worker,
    description: input.description,
    task: task && task.length > 260 ? `${task.slice(0, 260)}...` : task,
  };
}

async function importRuntimeModule<T>(filePath: string): Promise<T> {
  const specifier = JSON.stringify(pathToFileURL(filePath).href);
  return (0, eval)(`import(${specifier})`) as Promise<T>;
}

async function loadModeAgentConfig(configPath: string, mode: "quick" | "deep") {
  const raw = await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"));
  const configDir = path.dirname(configPath);
  const config = JSON.parse(raw) as {
    context?: { maxChars?: number; summaryChars?: number };
    maxTurns?: number;
    skills?: { directories?: string[] };
    workspaceRoot?: string;
  } & Record<string, unknown>;

  config.workspaceRoot = path.resolve(configDir, config.workspaceRoot ?? ".");
  config.skills = {
    ...(config.skills ?? {}),
    directories: (config.skills?.directories ?? ["./skills", "./src/skills"]).map((directory) =>
      path.resolve(configDir, directory)
    ),
  };

  if (mode === "quick") {
    return {
      ...config,
      maxTurns: Math.min(Number(config.maxTurns ?? 20), 6),
      context: {
        ...(config.context ?? {}),
        maxChars: Math.min(Number(config.context?.maxChars ?? 120000), 40000),
        summaryChars: Math.min(Number(config.context?.summaryChars ?? 12000), 6000),
      },
    };
  }

  return config;
}
