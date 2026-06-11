import readline from "node:readline/promises";
import { stdin as input, stderr as output } from "node:process";
import type { AgentConfig, ApprovalProvider, ApprovalRequest, TraceSink } from "../types.js";
import { stringify } from "../utils.js";

type CliApprovalOptions = {
  beforePrompt?: () => void;
  question?: (prompt: string) => Promise<string>;
};

export function createCliApprovalProvider(config: AgentConfig, emit: TraceSink, assumeYes: boolean | (() => boolean), options: CliApprovalOptions = {}): ApprovalProvider {
  return async (request: ApprovalRequest) => {
    const shouldAssumeYes = typeof assumeYes === "function" ? assumeYes() : assumeYes;
    if (config.permissions.mode === "unrestricted" || shouldAssumeYes) return true;
    if (config.permissions.mode === "readonly" && request.risk !== "low") return false;
    if (request.risk === "low" && config.permissions.autoApproveReadOnly) return true;

    options.beforePrompt?.();
    emit({ type: "approval_required", tool: request.toolName, risk: request.risk, reason: request.reason });
    output.write(`\nApproval: ${request.toolName} (${request.risk})\n`);
    output.write(`${stringify(compactApprovalInput(request.toolName, request.input), 1200)}\n`);
    if (options.question) {
      const answer = await options.question("Approve? [y/N] ");
      const approved = isApproved(answer);
      emit({ type: "approval_result", tool: request.toolName, approved });
      return approved;
    }

    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question("Approve? [y/N] ");
      const approved = isApproved(answer);
      emit({ type: "approval_result", tool: request.toolName, approved });
      return approved;
    } finally {
      rl.close();
    }
  };
}

function compactApprovalInput(toolName: string, input: ApprovalRequest["input"]): ApprovalRequest["input"] {
  if (toolName !== "delegate_to_worker") return input;
  const task = typeof input.task === "string" ? input.task.replace(/\s+/g, " ").trim() : undefined;
  return {
    worker: input.worker,
    description: input.description,
    task: task && task.length > 220 ? `${task.slice(0, 220)}...` : task,
  };
}

function isApproved(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
