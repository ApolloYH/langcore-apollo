import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentConfig, JsonObject, ToolDefinition, ToolExecutionContext, TraceSink, WorkerConfig } from "../types.js";
import { safeResolve, stringify, truncate } from "../utils.js";
import { SkillManager } from "../skills/skills.js";
import { McpManager } from "../mcp/manager.js";
import { ToolRegistry } from "./registry.js";

const execFileAsync = promisify(execFile);

type BuiltinOptions = {
  config: AgentConfig;
  skillManager: SkillManager;
  mcpManager: McpManager;
  runWorker?: (worker: WorkerConfig, task: string, emit: TraceSink) => Promise<string>;
};

export function createBuiltinRegistry(options: BuiltinOptions): ToolRegistry {
  const registry = new ToolRegistry();
  const { config, skillManager, mcpManager } = options;

  registry.register({
    name: "list_files",
    description: "List files under the workspace. Can list outside the workspace only after human approval.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Relative directory path." },
      },
    },
    execute: async (input, context) => {
      const directory = stringInput(input, "directory", ".");
      const fullPath = await resolvePathWithBoundaryApproval(config, context, directory, "list directory");
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return {
        content: entries
          .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${path.join(directory, entry.name)}`)
          .join("\n"),
      };
    },
  });

  registry.register({
    name: "read_file",
    description: "Read a UTF-8 file. Files outside the workspace require human approval.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxChars: { type: "number" },
      },
      required: ["path"],
    },
    execute: async (input, context) => {
      const targetPath = requiredString(input, "path");
      const fullPath = await resolvePathWithBoundaryApproval(config, context, targetPath, "read file");
      const maxChars = numberInput(input, "maxChars", 20000);
      return { content: truncate(await fs.readFile(fullPath, "utf8"), maxChars) };
    },
  });

  registry.register({
    name: "write_file",
    description: "Write a UTF-8 file. Writes outside the workspace require explicit approval. Creates parent directories when needed.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    execute: async (input, context) => {
      const targetPath = requiredString(input, "path");
      const fullPath = await resolvePathWithBoundaryApproval(config, context, targetPath, "write file");
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, requiredString(input, "content"), "utf8");
      return { content: `Wrote ${path.relative(config.workspaceRoot, fullPath)}` };
    },
  });

  registry.register({
    name: "shell_exec",
    description: "Run a local shell command in the workspace for builds, tests, package scripts, or system inspection. Do not use for HTTP requests; use web_search or web_fetch instead.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["command"],
    },
    execute: async (input) => {
      const command = requiredString(input, "command");
      const timeout = numberInput(input, "timeoutMs", 30000);
      const { stdout, stderr } = await execFileAsync("zsh", ["-lc", command], {
        cwd: config.workspaceRoot,
        timeout,
        maxBuffer: 1024 * 1024 * 4,
      });
      return { content: truncate([stdout, stderr].filter(Boolean).join("\n"), 12000) || "(no output)" };
    },
  });

  registry.register({
    name: "web_search",
    description: "Search the public web for current external information. Use when facts may have changed recently or the user asks for online research.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        maxResults: { type: "number", description: "Maximum number of results to return. Default 5, max 10." },
      },
      required: ["query"],
    },
    execute: async (input) => {
      const query = requiredString(input, "query");
      const maxResults = Math.min(Math.max(Math.trunc(numberInput(input, "maxResults", 5)), 1), 10);
      const results = await webSearch(query, maxResults);
      return { content: stringify({ query, results }, 12000) };
    },
  });

  registry.register({
    name: "web_fetch",
    description: "Fetch a public HTTP/HTTPS URL and return readable text. Use for specific URLs, GitHub API endpoints, raw files, READMEs, and pages found by web_search. Do not use shell_exec with curl/wget/python for web requests.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public HTTP or HTTPS URL to fetch." },
        maxChars: { type: "number", description: "Maximum returned characters. Default 12000, max 50000." },
      },
      required: ["url"],
    },
    execute: async (input) => {
      const url = requiredString(input, "url");
      const maxChars = Math.min(Math.max(Math.trunc(numberInput(input, "maxChars", 12000)), 1000), 50000);
      const fetched = await webFetch(url, maxChars);
      return { content: stringify(fetched, maxChars + 1000) };
    },
  });

  registry.register({
    name: "git_status",
    description: "Show git status for the workspace.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: () => git(config.workspaceRoot, ["status", "--short"]),
  });

  registry.register({
    name: "git_diff",
    description: "Show git diff for the workspace.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        staged: { type: "boolean" },
      },
    },
    execute: (input) => git(config.workspaceRoot, input.staged === true ? ["diff", "--cached"] : ["diff"]),
  });

  registry.register({
    name: "git_commit",
    description: "Create a git commit for current staged changes.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
    execute: (input) => git(config.workspaceRoot, ["commit", "-m", requiredString(input, "message")]),
  });

  registry.register({
    name: "email_send",
    description: "Compose an email. By default writes an .eml file to .agent/outbox; sends only if AGENT_SENDMAIL_PATH is configured.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
    execute: async (input) => {
      const to = requiredString(input, "to");
      const subject = requiredString(input, "subject");
      const body = requiredString(input, "body");
      const outbox = path.join(config.workspaceRoot, ".agent", "outbox");
      await fs.mkdir(outbox, { recursive: true });
      const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.eml`;
      const eml = `To: ${to}\nSubject: ${subject}\nContent-Type: text/plain; charset=utf-8\n\n${body}\n`;
      const emlPath = path.join(outbox, filename);
      await fs.writeFile(emlPath, eml, "utf8");
      const sendmail = process.env.AGENT_SENDMAIL_PATH;
      if (sendmail) {
        await sendToProcess(sendmail, ["-t"], eml);
        return { content: `Email sent and archived at ${path.relative(config.workspaceRoot, emlPath)}` };
      }
      return { content: `Email written to ${path.relative(config.workspaceRoot, emlPath)}. Set AGENT_SENDMAIL_PATH to send.` };
    },
  });

  registry.register({
    name: "request_human_approval",
    description: "Ask the human to approve or decide a high-value action before continuing.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        context: { type: "string" },
      },
      required: ["question"],
    },
    execute: async (input, context) => {
      const question = requiredString(input, "question");
      const approved = await context.requestApproval({
        toolName: "request_human_approval",
        risk: "high",
        reason: question,
        input,
      });
      return { content: approved ? "Human approved." : "Human rejected.", isError: !approved };
    },
  });

  registry.register({
    name: "skill_search",
    description: "Search local skills by keyword.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
    },
    execute: async (input) => ({ content: stringify(await skillManager.search(stringInput(input, "query", ""))) }),
  });

  registry.register({
    name: "skill_read",
    description: "Read a skill file returned by skill_search.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
    execute: async (input) => ({ content: await skillManager.read(requiredString(input, "path")) }),
  });

  registry.register({
    name: "skill_install",
    description: "Install a local skill into the first configured skills directory. Source must be a SKILL.md file or a directory containing SKILL.md.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Path to SKILL.md or a directory containing SKILL.md." },
        name: { type: "string", description: "Optional installed skill name." },
      },
      required: ["sourcePath"],
    },
    execute: async (input) => {
      const name = typeof input.name === "string" && input.name.trim() ? input.name : undefined;
      return { content: stringify(await skillManager.installLocal(requiredString(input, "sourcePath"), name)) };
    },
  });

  registry.register({
    name: "mcp_list_tools",
    description: "List tools exposed by configured MCP servers.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        server: { type: "string" },
      },
    },
    execute: async (input) => ({ content: stringify(await mcpManager.listTools(stringInput(input, "server", ""))) }),
  });

  registry.register({
    name: "mcp_call_tool",
    description: "Call a tool on a configured MCP server.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        server: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["server", "tool", "arguments"],
    },
    execute: async (input) => ({
      content: await mcpManager.callTool(requiredString(input, "server"), requiredString(input, "tool"), objectInput(input, "arguments")),
    }),
  });

  registry.register({
    name: "delegate_to_worker",
    description: `Launch a fresh subagent to handle a focused, complex task autonomously.

This is the Claude Code-style Task tool model. Use it for isolated research, broad codebase exploration, independent review, noisy multi-step investigation, or specialist implementation. Do not use it for simple questions, direct reads of known files, small edits, or tasks you can complete more clearly yourself.

The task must brief the subagent with enough context: goal, why it matters, relevant files/facts, what has already been tried, scope boundaries, whether code changes are expected, and expected output format. Worker results are returned to you, not directly to the user; you must synthesize the final user-facing answer.`,
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        worker: { type: "string" },
        description: { type: "string", description: "Short 3-5 word user-visible description of what the worker will do." },
        task: { type: "string" },
      },
      required: ["worker", "task"],
    },
    execute: async (input, context) => {
      if (!options.runWorker) return { content: "Worker delegation is disabled for this agent.", isError: true };
      const workerName = requiredString(input, "worker");
      const task = requiredString(input, "task");
      const description = stringInput(input, "description", `${workerName} task`);
      const worker = config.workers.find((candidate) => candidate.name === workerName);
      if (!worker) return { content: `Unknown worker: ${workerName}`, isError: true };
      context.emit({ type: "worker_start", worker: worker.name, task: description });
      const workerEmit: TraceSink = (event) => {
        switch (event.type) {
          case "llm_request":
            context.emit({ type: "worker_progress", worker: worker.name, message: `thinking turn ${event.turn}` });
            break;
          case "tool_call":
            context.emit({
              type: "worker_progress",
              worker: worker.name,
              message: `using ${event.tool} ${event.risk} risk ${compactWorkerInput(event.input)}`,
            });
            break;
          case "tool_result":
            context.emit({ type: "worker_progress", worker: worker.name, message: `${event.tool} ${event.isError ? "failed" : "done"}` });
            break;
          case "context_compacted":
            context.emit({
              type: "worker_progress",
              worker: worker.name,
              message: `context compacted ${event.beforeChars} -> ${event.afterChars} chars`,
            });
            break;
          default:
            break;
        }
      };
      const result = await options.runWorker(worker, task, workerEmit);
      context.emit({ type: "worker_finish", worker: worker.name, result: truncate(result, 1000) });
      return { content: `Subagent ${worker.name} completed.\n\n${result}` };
    },
  });

  return registry;
}

function compactWorkerInput(input: JsonObject): string {
  const text = stringify(input, 500).replace(/\s+/g, " ");
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

async function git(cwd: string, args: string[]) {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout: 30000, maxBuffer: 1024 * 1024 * 4 });
  return { content: truncate([stdout, stderr].filter(Boolean).join("\n"), 12000) || "(no output)" };
}

async function resolvePathWithBoundaryApproval(
  config: AgentConfig,
  context: ToolExecutionContext,
  targetPath: string,
  operation: string,
): Promise<string> {
  try {
    return safeResolve(config.workspaceRoot, targetPath);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Path escapes workspace:")) {
      throw error;
    }
  }

  const resolvedPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(config.workspaceRoot, targetPath);
  const approved = await context.requestApproval({
    toolName: "workspace_boundary",
    risk: "high",
    reason: `Allow ${operation} outside workspace: ${resolvedPath}`,
    input: {
      operation,
      path: targetPath,
      resolvedPath,
      workspaceRoot: config.workspaceRoot,
    },
  });
  if (!approved) {
    throw new Error(`Permission denied for ${operation} outside workspace: ${resolvedPath}`);
  }
  return resolvedPath;
}

async function webSearch(query: string, maxResults: number): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const errors: string[] = [];
  for (const provider of [searchBing, searchDuckDuckGo]) {
    try {
      const results = await provider(query, maxResults);
      if (results.length > 0) return results;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`web_search failed: ${errors.join("; ") || "no results"}`);
}

async function webFetch(urlText: string, maxChars: number): Promise<{ url: string; status: number; contentType: string; content: string }> {
  const url = new URL(urlText);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LangCoreAgent/0.1; +https://localhost)",
      accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  if (!response.ok) {
    return {
      url: response.url,
      status: response.status,
      contentType,
      content: truncate(readableWebContent(raw, contentType), maxChars),
    };
  }

  return {
    url: response.url,
    status: response.status,
    contentType,
    content: truncate(readableWebContent(raw, contentType), maxChars),
  };
}

function readableWebContent(raw: string, contentType: string): string {
  if (contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (contentType.includes("text/html")) {
    return cleanHtml(
      raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n"),
    );
  }
  return raw;
}

async function searchBing(query: string, maxResults: number): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = `https://www.bing.com/search?${new URLSearchParams({ q: query, mkt: "en-US", setlang: "en-US" }).toString()}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LangCoreAgent/0.1; +https://localhost)",
      accept: "text/html",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Bing returned HTTP ${response.status}`);
  }
  const html = await response.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultPattern = /<li[^>]+class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/g;

  for (const match of html.matchAll(resultPattern)) {
    const urlText = decodeHtml(match[1] ?? "");
    const title = cleanHtml(match[2] ?? "");
    const snippet = cleanHtml(match[3] ?? "");
    if (title && urlText) results.push({ title, url: urlText, snippet });
    if (results.length >= maxResults) break;
  }
  return results;
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = `https://html.duckduckgo.com/html/?${new URLSearchParams({ q: query }).toString()}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LangCoreAgent/0.1; +https://localhost)",
      accept: "text/html",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  }
  const html = await response.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  for (const match of html.matchAll(resultPattern)) {
    const rawUrl = decodeHtml(match[1] ?? "");
    const title = cleanHtml(match[2] ?? "");
    const snippet = cleanHtml(match[3] ?? "");
    const decodedUrl = normalizeDuckDuckGoUrl(rawUrl);
    if (title && decodedUrl) {
      results.push({ title, url: decodedUrl, snippet });
    }
    if (results.length >= maxResults) break;
  }

  if (results.length > 0) return results;

  const fallbackPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]{1,240}?)<\/a>/g;
  for (const match of html.matchAll(fallbackPattern)) {
    const decodedUrl = normalizeDuckDuckGoUrl(decodeHtml(match[1] ?? ""));
    const title = cleanHtml(match[2] ?? "");
    if (title && decodedUrl && !decodedUrl.includes("duckduckgo.com")) {
      results.push({ title, url: decodedUrl, snippet: "" });
    }
    if (results.length >= maxResults) break;
  }
  return results;
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return rawUrl;
  }
}

function cleanHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

async function sendToProcess(command: string, args: string[], input: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out running ${command}`));
    }, 30000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

function requiredString(input: JsonObject, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing string input: ${key}`);
  return value;
}

function stringInput(input: JsonObject, key: string, fallback: string): string {
  const value = input[key];
  return typeof value === "string" ? value : fallback;
}

function numberInput(input: JsonObject, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectInput(input: JsonObject, key: string): JsonObject {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Missing object input: ${key}`);
  return value as JsonObject;
}
