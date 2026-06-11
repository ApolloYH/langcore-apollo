import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig, LlmConfig } from "./types.js";

const defaultConfig: AgentConfig = {
  workspaceRoot: ".",
  maxTurns: 20,
  context: {
    maxChars: 120000,
    summaryChars: 12000,
  },
  permissions: {
    mode: "ask",
    autoApproveReadOnly: true,
  },
  skills: {
    directories: ["./skills", "./src/skills"],
  },
  mcpServers: {},
  workers: [
    {
      name: "general-purpose",
      whenToUse: "Complex research, broad codebase exploration, and multi-step investigation when the right files or answer are not obvious.",
      tools: ["*"],
      instructions:
        "You are a general-purpose subagent. Search broadly, investigate thoroughly, and return a concise report with key findings and evidence.",
    },
    {
      name: "coder",
      whenToUse: "Focused implementation work after the supervisor has identified the files, goal, and expected change.",
      tools: ["read_file", "write_file", "list_files", "shell_exec", "git_diff"],
      instructions: "You are a focused implementation worker. Make concrete code changes and report concise results.",
    },
    {
      name: "reviewer",
      whenToUse: "Independent review of code changes, designs, migrations, or risky implementation decisions.",
      tools: ["read_file", "list_files", "git_diff", "shell_exec"],
      instructions: "You are a code review worker. Prioritize bugs, regressions, security risks, and missing tests.",
    },
  ],
};

export async function loadAgentConfig(configPath?: string): Promise<AgentConfig> {
  if (!configPath) {
    return { ...defaultConfig, workspaceRoot: path.resolve(defaultConfig.workspaceRoot) };
  }
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AgentConfig>;
  const baseDir = path.dirname(path.resolve(configPath));
  return {
    ...defaultConfig,
    ...parsed,
    workspaceRoot: path.resolve(baseDir, parsed.workspaceRoot ?? defaultConfig.workspaceRoot),
    context: { ...defaultConfig.context, ...parsed.context },
    permissions: { ...defaultConfig.permissions, ...parsed.permissions },
    skills: { ...defaultConfig.skills, ...parsed.skills },
    mcpServers: parsed.mcpServers ?? defaultConfig.mcpServers,
    workers: parsed.workers ?? defaultConfig.workers,
  };
}

export function loadEnvFile(envPath = ".env"): boolean {
  const resolvedPath = path.resolve(envPath);
  if (!fsSync.existsSync(resolvedPath)) return false;

  const raw = fsSync.readFileSync(resolvedPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    process.env[key] = unwrapEnvValue(rawValue);
  }
  return true;
}

function unwrapEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadLlmConfig(): LlmConfig {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const model = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "claude-haiku-4-5";
  if (!authToken) {
    throw new Error("Missing ANTHROPIC_AUTH_TOKEN. Set it in your shell or .env loader before running.");
  }
  return {
    authToken,
    baseUrl,
    model,
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096),
  };
}
