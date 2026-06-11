#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import { loadAgentConfig, loadEnvFile, loadLlmConfig } from "./config.js";
import { QueryEngine } from "./runtime/query-engine.js";
import { createCliApprovalProvider } from "./runtime/permissions.js";
import { SkillManager } from "./skills/skills.js";
import { CliTraceRenderer, type CliTraceOptions } from "./trace.js";
import type { TraceEvent, TraceSink } from "./types.js";

type CliArgs = {
  configPath?: string;
  task?: string;
  verbose: boolean;
  yes: boolean;
  stream: boolean;
  color: boolean;
};

type SlashCommand = {
  command: string;
  usage: string;
  description: string;
};

type ActiveCliInput = {
  clearForExternalOutput: () => void;
  renderAfterExternalOutput: () => void;
  cancelForModal: () => void;
};

type LiveStatus = {
  text: string;
  startedAt: number;
  frame: number;
  timer: NodeJS.Timeout;
};

let activeCliInput: ActiveCliInput | undefined;
let modalActive = false;
let resolveModal: (() => void) | undefined;
let modalDone: Promise<void> | undefined;
let runtimeStatus: "idle" | "thinking" | "working" = "idle";
let liveStatus: LiveStatus | undefined;
let runningWorkerCount = 0;

const slashCommands: SlashCommand[] = [
  { command: "/help", usage: "/help", description: "显示 CLI 命令菜单" },
  { command: "/skill", usage: "/skill", description: "列出已安装的 skills" },
  { command: "/skill install", usage: "/skill install <path> [name]", description: "从本地 SKILL.md 或目录安装 skill" },
  { command: "/agents", usage: "/agents", description: "查看最近多智能体 worker 活动" },
  { command: "/verbose", usage: "/verbose on|off", description: "开启或关闭思考和工具过程输出" },
  { command: "/stream", usage: "/stream on|off", description: "开启或关闭回答流式输出" },
  { command: "/yes", usage: "/yes [on|off]", description: "切换或设置自动审批模式" },
  { command: "/clear", usage: "/clear", description: "清空当前对话上下文" },
  { command: "/exit", usage: "/exit", description: "退出 LangCore" },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile();
  const task = args.task ?? (stdin.isTTY ? undefined : (await readStdin()).trim());
  if (!task && !stdin.isTTY) {
    stdout.write(`Usage: npm run dev -- "your task"\n`);
    stdout.write(`Interactive: npm run dev -- --config agent.config.json\n`);
    stdout.write(`Options: --config agent.config.json --quiet --no-stream --no-color --yes\n`);
    process.exitCode = 1;
    return;
  }

  const agentConfig = await loadAgentConfig(args.configPath);
  const llmConfig = loadLlmConfig();
  const interactiveMode = !task && stdin.isTTY;
  let yes = args.yes;
  const traceOptions: CliTraceOptions = {
    verbose: args.verbose,
    stream: args.stream,
    color: args.color,
    status: true,
    stdout,
    stderr: process.stderr,
    beforeOutput: () => {
      if (!modalActive) activeCliInput?.clearForExternalOutput();
    },
    afterOutput: (text) => {
      if (!modalActive && text.endsWith("\n")) activeCliInput?.renderAfterExternalOutput();
    },
    suspendLiveStatus: () => modalActive,
    staticStatus: interactiveMode,
  };
  const renderer = new CliTraceRenderer(traceOptions);
  const rendererSink = renderer.sink();
  const workerActivity = new WorkerActivityLog();
  const traceSink: TraceSink = (event) => {
    updateRuntimeStatus(event);
    updateLiveStatus(event, interactiveMode);
    workerActivity.record(event);
    rendererSink(event);
  };
  const createRuntime = (approvalProvider?: ReturnType<typeof createCliApprovalProvider>) => new QueryEngine({
    agentConfig,
    llmConfig,
    emit: traceSink,
    assumeYes: () => yes,
    approvalProvider,
    stream: () => traceOptions.stream,
  });

  if (task) {
    const runtime = createRuntime();
    const result = await runWithRenderer(renderer, () => runtime.submitMessage(task));
    if (!traceOptions.stream) stdout.write(`${result.trim()}\n`);
    return;
  }

  stdout.write(renderWelcomeBanner({ model: llmConfig.model, cwd: agentConfig.workspaceRoot, color: traceOptions.color }));
  const skillManager = new SkillManager(agentConfig);
  const approvalProvider = createCliApprovalProvider(agentConfig, traceSink, () => yes, {
    beforePrompt: () => {
      beginModalInput();
      activeCliInput?.cancelForModal();
    },
    question: async (questionPrompt) => {
      try {
        return await askPlainQuestion(questionPrompt);
      } finally {
        endModalInput();
      }
    },
  });
  const runtime = createRuntime(approvalProvider);
  let activeTask: Promise<void> | undefined;
  while (true) {
    if (modalActive && modalDone) {
      await modalDone;
      continue;
    }
    let text = (await readCliLine({
      color: traceOptions.color,
    })).trim();
    if (!text) {
      continue;
    }
    if (text === "/exit" || text === "/quit") {
      if (activeTask) {
        stdout.write("A task is still running. Wait for it to finish before exiting.\n");
        continue;
      }
      break;
    }
    if (text === "/" || text === "/help") {
      stdout.write(renderSlashCommandMenu(traceOptions.color));
      continue;
    }
    if (text === "/skills" || text === "/skill") {
      const skills = await skillManager.search("");
      if (skills.length === 0) {
        stdout.write("No skills installed.\n");
      } else {
        stdout.write(`${skills.map((skill) => `- ${skill.name}: ${skill.path}`).join("\n")}\n`);
      }
      continue;
    }
    if (text === "/agents" || text === "/workers") {
      stdout.write(workerActivity.render(traceOptions.color));
      continue;
    }
    if (text.startsWith("/skill install ")) {
      try {
        const [sourcePath, name] = parseCommandWords(text.slice("/skill install ".length));
        if (!sourcePath) {
          stdout.write("Usage: /skill install <path-to-SKILL.md-or-dir> [name]\n");
        } else {
          const installed = await skillManager.installLocal(sourcePath, name);
          stdout.write(`Installed skill ${installed.name}: ${installed.path}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stdout.write(`Failed to install skill: ${message}\n`);
      }
      continue;
    }
    if (text === "/skill install") {
      stdout.write("Usage: /skill install <path-to-SKILL.md-or-dir> [name]\n");
      continue;
    }
    if (text === "/clear") {
      runtime.clearConversation();
      workerActivity.clear();
      stdout.write("conversation cleared\n");
      continue;
    }
    if (text.startsWith("/verbose")) {
      const value = text.split(/\s+/)[1];
      traceOptions.verbose = value === "on" ? true : value === "off" ? false : traceOptions.verbose;
      stdout.write(`verbose=${traceOptions.verbose ? "on" : "off"}\n`);
      continue;
    }
    if (text.startsWith("/stream")) {
      const value = text.split(/\s+/)[1];
      traceOptions.stream = value === "on" ? true : value === "off" ? false : traceOptions.stream;
      stdout.write(`stream=${traceOptions.stream ? "on" : "off"}\n`);
      continue;
    }
    if (text.startsWith("/yes")) {
      const value = text.split(/\s+/)[1];
      yes = value === "on" ? true : value === "off" ? false : !yes;
      stdout.write(`yes=${yes ? "on" : "off"}\n`);
      continue;
    }
    if (text.startsWith("/")) {
      stdout.write(`Unknown command: ${text}\n`);
      stdout.write(renderSlashCommandMenu(traceOptions.color));
      continue;
    }
    if (activeTask) {
      stdout.write("A task is running. Use /agents to inspect worker activity, or wait for completion.\n");
      continue;
    }
    runningWorkerCount = 0;
    activeTask = runWithRenderer(renderer, () => runtime.submitMessage(text))
      .then((result) => {
        if (!traceOptions.stream) stdout.write(`${result.trim()}\n`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        stdout.write(`${message}\n`);
      })
      .finally(() => {
        activeTask = undefined;
        runtimeStatus = "idle";
        runningWorkerCount = 0;
        stopLiveStatus();
      });
  }
  stopLiveStatus();
  stdin.pause();
}

function updateRuntimeStatus(event: TraceEvent): void {
  switch (event.type) {
    case "llm_request":
      runtimeStatus = "thinking";
      break;
    case "tool_call":
    case "worker_start":
    case "worker_progress":
      runtimeStatus = "working";
      break;
    case "llm_response":
      runtimeStatus = event.stopReason === "tool_use" ? "working" : runtimeStatus;
      break;
    case "tool_result":
    case "worker_finish":
      runtimeStatus = "thinking";
      break;
    default:
      break;
  }
}

function updateLiveStatus(event: TraceEvent, enabled: boolean): void {
  if (!enabled) return;
  switch (event.type) {
    case "llm_request":
      startLiveStatus(runningWorkerCount > 0 ? formatRunningWorkers() : "Thinking");
      break;
    case "tool_call":
      startLiveStatus(`Using ${event.tool}`);
      break;
    case "worker_start":
      runningWorkerCount += 1;
      startLiveStatus(formatRunningWorkers());
      break;
    case "assistant_delta":
    case "llm_response":
    case "tool_result":
    case "approval_required":
      if (runningWorkerCount === 0) stopLiveStatus();
      break;
    case "worker_finish":
      runningWorkerCount = Math.max(0, runningWorkerCount - 1);
      if (runningWorkerCount > 0) {
        startLiveStatus(formatRunningWorkers());
      } else {
        startLiveStatus("Thinking");
      }
      break;
    default:
      break;
  }
}

function formatRunningWorkers(): string {
  return runningWorkerCount === 1 ? "Running 1 agent" : `Running ${runningWorkerCount} agents`;
}

function startLiveStatus(text: string): void {
  if (liveStatus?.text === text) return;
  stopLiveStatus();
  liveStatus = {
    text,
    startedAt: Date.now(),
    frame: 0,
    timer: setInterval(() => {
      if (!liveStatus || modalActive) return;
      liveStatus.frame += 1;
      activeCliInput?.renderAfterExternalOutput();
    }, 120),
  };
  liveStatus.timer.unref?.();
  activeCliInput?.renderAfterExternalOutput();
}

function stopLiveStatus(): void {
  if (!liveStatus) return;
  clearInterval(liveStatus.timer);
  liveStatus = undefined;
  if (!modalActive) activeCliInput?.renderAfterExternalOutput();
}

async function readCliLine(options: { color: boolean }): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    stdout.write(options.color ? "\x1b[38;2;96;165;250mlangcore>\x1b[0m " : "langcore> ");
    return readStdinLine();
  }

  let buffer = "";
  let paletteOpen = false;
  let selected = 0;
  let renderedLines = 0;
  let done = false;
  let result = "";
  let onData: ((chunk: string) => void) | undefined;
  let resolveLine: ((value: string) => void) | undefined;
  let previousRawMode = false;
  let renderedCursorLine = 0;

  const complete = (value: string) => {
    if (done) return;
    result = value;
    done = true;
    if (onData) stdin.off("data", onData);
    if (stdin.isTTY) stdin.setRawMode(previousRawMode);
    if (activeCliInput?.cancelForModal === cancelForModal) activeCliInput = undefined;
    resolveLine?.(result);
  };

  const linesForState = (): string[] => {
    const lines = [];
    const liveStatusLine = renderLiveStatusLine(options.color);
    if (liveStatusLine) lines.push(liveStatusLine);
    lines.push(renderInputBorder("top", options.color));
    lines.push(`${renderInputPrompt(options.color)}${buffer}`);
    if (paletteOpen) lines.push(...renderSlashPaletteLines(selected, options.color));
    lines.push(renderInputBorder("bottom", options.color));
    return lines;
  };

  const clearRendered = () => {
    if (renderedLines === 0) return;
    if (renderedCursorLine > 0) {
      stdout.write(`\x1b[${renderedCursorLine}A\r`);
    } else {
      stdout.write("\r");
    }
    for (let index = 0; index < renderedLines; index += 1) {
      stdout.write("\x1b[2K");
      if (index < renderedLines - 1) stdout.write("\x1b[1B\r");
    }
    if (renderedLines > 1) stdout.write(`\x1b[${renderedLines - 1}A\r`);
    renderedLines = 0;
    renderedCursorLine = 0;
  };

  const render = () => {
    if (done) return;
    clearRendered();
    const lines = linesForState();
    stdout.write(lines.join("\n"));
    renderedLines = lines.length;
    renderedCursorLine = renderLiveStatusLine(options.color) ? 2 : 1;
    const rowsBelowInput = lines.length - 1 - renderedCursorLine;
    stdout.write(`\x1b[${rowsBelowInput}A\r\x1b[${3 + displayLength(buffer)}G`);
  };

  const finish = (value: string) => {
    clearRendered();
    if (value) {
      stdout.write(`${renderInputBorder("top", options.color)}\n${renderInputPrompt(options.color)}${value}\n${renderInputBorder("bottom", options.color)}\n`);
    }
    complete(value);
  };

  const cancelForModal = () => {
    clearRendered();
    complete("");
  };

  const closePalette = () => {
    paletteOpen = false;
    selected = 0;
  };

  const handleKey = (chunk: string) => {
    if (done) return;
    if (paletteOpen) {
      if (chunk === "\x1b[B" || chunk === "\t") {
        selected = (selected + 1) % slashCommands.length;
        render();
        return;
      }
      if (chunk === "\x1b[A") {
        selected = (selected - 1 + slashCommands.length) % slashCommands.length;
        render();
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        finish(slashCommands[selected]?.command ?? "/help");
        return;
      }
      if (chunk === "\x1b") {
        buffer = "";
        closePalette();
        render();
        return;
      }
    }

    if (chunk === "\u0003" || chunk === "\u0004") {
      finish("/exit");
      return;
    }
    if (chunk === "\r" || chunk === "\n") {
      finish(buffer);
      return;
    }
    if (chunk === "\x7f") {
      buffer = Array.from(buffer).slice(0, -1).join("");
      if (buffer !== "/") closePalette();
      render();
      return;
    }
    if (chunk === "\t" || chunk.startsWith("\x1b")) {
      return;
    }

    for (const char of chunk) {
      if (char < " ") continue;
      buffer += char;
    }
    if (buffer === "/") {
      paletteOpen = true;
      selected = 0;
    } else if (paletteOpen) {
      closePalette();
    }
    render();
  };

  return await new Promise<string>((resolve) => {
    resolveLine = resolve;
    previousRawMode = stdin.isRaw;
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    activeCliInput = {
      clearForExternalOutput: clearRendered,
      renderAfterExternalOutput: render,
      cancelForModal,
    };
    onData = (chunk: string) => {
      for (const key of tokenizeKeyInput(chunk)) {
        handleKey(key);
        if (done) break;
      }
      if (!done) return;
    };
    stdin.on("data", onData);
    render();
  });
}

function beginModalInput(): void {
  if (modalActive) return;
  modalActive = true;
  modalDone = new Promise<void>((resolve) => {
    resolveModal = resolve;
  });
}

function endModalInput(): void {
  if (!modalActive) return;
  modalActive = false;
  resolveModal?.();
  resolveModal = undefined;
  modalDone = undefined;
}

async function askPlainQuestion(prompt: string): Promise<string> {
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) stdin.setRawMode(false);
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
  }
}

function tokenizeKeyInput(input: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < input.length;) {
    const sequence = input.slice(index, index + 3);
    if (sequence === "\x1b[A" || sequence === "\x1b[B" || sequence === "\x1b[C" || sequence === "\x1b[D") {
      tokens.push(sequence);
      index += 3;
      continue;
    }
    const char = Array.from(input.slice(index))[0] ?? "";
    tokens.push(char);
    index += char.length;
  }
  return tokens;
}

async function readStdinLine(): Promise<string> {
  let line = "";
  for await (const chunk of stdin) {
    const text = String(chunk);
    const newline = text.search(/\r|\n/);
    if (newline >= 0) return `${line}${text.slice(0, newline)}`;
    line += text;
  }
  return line;
}

function completeSlashCommand(line: string): [string[], string] {
  if (!line.startsWith("/")) return [[], line];
  const commandNames = slashCommands.map((command) => command.command);
  const hits = commandNames.filter((command) => command.startsWith(line));
  return [hits.length > 0 ? hits : commandNames, line];
}

function renderSlashCommandMenu(useColor: boolean): string {
  const width = Math.max(...slashCommands.map((command) => displayLength(command.usage)));
  const title = useColor ? "\x1b[38;2;96;165;250mSlash commands\x1b[0m" : "Slash commands";
  const rows = slashCommands
    .map((command) => {
      const usage = useColor ? `\x1b[38;2;96;165;250m${command.usage}\x1b[0m` : command.usage;
      return `  ${padDisplay(command.usage, width, usage)}  ${command.description}`;
    })
    .join("\n");
  return `\n${title}\n${rows}\n`;
}

function renderSlashPaletteLines(selectedIndex: number, useColor: boolean): string[] {
  const width = Math.max(...slashCommands.map((command) => displayLength(command.usage)));
  const title = useColor ? "\x1b[38;2;96;165;250mSlash commands\x1b[0m" : "Slash commands";
  const maxVisibleCommands = 8;
  const maxStart = Math.max(0, slashCommands.length - maxVisibleCommands);
  const start = Math.min(Math.max(0, selectedIndex - Math.floor(maxVisibleCommands / 2)), maxStart);
  const visibleCommands = slashCommands.slice(start, start + maxVisibleCommands);
  const rows = visibleCommands.map((command, offset) => {
    const index = start + offset;
    const pointer = index === selectedIndex ? "›" : " ";
    const padded = padDisplay(command.usage, width);
    const text = `${pointer} ${padded}  ${command.description}`;
    if (!useColor) return text;
    if (index === selectedIndex) return `\x1b[7m${text}\x1b[0m`;
    return `\x1b[90m${text}\x1b[0m`;
  });
  while (rows.length < maxVisibleCommands) {
    rows.push("");
  }
  const range = slashCommands.length > maxVisibleCommands
    ? `${start + 1}-${Math.min(start + maxVisibleCommands, slashCommands.length)}/${slashCommands.length}`
    : `${slashCommands.length}/${slashCommands.length}`;
  const hint = useColor ? "\x1b[90m↑/↓/Tab select · Enter run · Esc close\x1b[0m" : "↑/↓/Tab select · Enter run · Esc close";
  const rangeLine = useColor ? `\x1b[90m${range}\x1b[0m` : range;
  return [title, ...rows, `${hint} · ${rangeLine}`];
}

type WorkerActivity = {
  id: number;
  worker: string;
  task: string;
  status: "running" | "finished";
  startedAt: number;
  finishedAt?: number;
  lines: Array<{ at: number; text: string }>;
  result?: string;
};

class WorkerActivityLog {
  private nextId = 1;
  private readonly activities: WorkerActivity[] = [];

  record(event: TraceEvent): void {
    if (event.type === "worker_start") {
      this.activities.push({
        id: this.nextId,
        worker: event.worker,
        task: event.task,
        status: "running",
        startedAt: Date.now(),
        lines: [],
      });
      this.nextId += 1;
      return;
    }

    if (event.type === "worker_progress") {
      const activity = this.findLatestRunning(event.worker);
      if (!activity) return;
      activity.lines.push({ at: Date.now(), text: event.message });
      return;
    }

    if (event.type === "worker_finish") {
      const activity = this.findLatestRunning(event.worker);
      if (!activity) return;
      activity.status = "finished";
      activity.finishedAt = Date.now();
      activity.result = event.result;
    }
  }

  clear(): void {
    this.activities.length = 0;
    this.nextId = 1;
  }

  render(useColor: boolean): string {
    if (this.activities.length === 0) return "\nNo worker activity yet.\n";
    const title = useColor ? "\x1b[38;2;96;165;250mAgents\x1b[0m" : "Agents";
    const rows = this.activities
      .slice(-12)
      .map((activity) => this.renderActivity(activity, useColor))
      .join("\n");
    return `\n${title}\n${rows}\n`;
  }

  private renderActivity(activity: WorkerActivity, useColor: boolean): string {
    const status = activity.status === "finished" ? "finished" : "running";
    const duration = `${(((activity.finishedAt ?? Date.now()) - activity.startedAt) / 1000).toFixed(1)}s`;
    const bullet = activity.status === "finished" ? paint("•", "green", useColor) : paint("•", "gray", useColor);
    const header = `${bullet} ${activity.worker} #${activity.id} ${status} ${duration}`;
    const lines = [
      `  ${paint("└", "gray", useColor)} task: ${compactLine(activity.task, 120)}`,
      ...activity.lines.slice(-20).map((line) => {
        const elapsed = `${((line.at - activity.startedAt) / 1000).toFixed(1)}s`;
        return `  ${paint("└", "gray", useColor)} ${elapsed} ${compactLine(line.text, 150)}`;
      }),
    ];
    if (activity.result) {
      lines.push(`  ${paint("└", "gray", useColor)} result: ${compactLine(activity.result, 180)}`);
    }
    return `${header}\n${lines.join("\n")}`;
  }

  private findLatestRunning(worker: string): WorkerActivity | undefined {
    for (let index = this.activities.length - 1; index >= 0; index -= 1) {
      const activity = this.activities[index];
      if (activity.worker === worker && activity.status === "running") return activity;
    }
    return undefined;
  }
}

function paint(text: string, colorName: "green" | "gray", useColor: boolean): string {
  if (!useColor) return text;
  const code = colorName === "green" ? "\x1b[32m" : "\x1b[90m";
  return `${code}${text}\x1b[0m`;
}

function compactLine(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (displayLength(normalized) <= max) return normalized;
  return truncateDisplay(normalized, max);
}

function renderInputPrompt(useColor: boolean): string {
  return useColor ? "\x1b[38;2;96;165;250m›\x1b[0m " : "› ";
}

function renderLiveStatusLine(useColor: boolean): string | undefined {
  if (!liveStatus) return undefined;
  const elapsed = `${((Date.now() - liveStatus.startedAt) / 1000).toFixed(1)}s`;
  const statusText = `${typewriterFrame(`${liveStatus.text}...`, liveStatus.frame)} ${elapsed}`;
  const bullet = useColor ? "\x1b[32m•\x1b[0m" : "•";
  const status = useColor ? `\x1b[32m${statusText}\x1b[0m` : statusText;
  return `${bullet} ${status}`;
}

function typewriterFrame(text: string, frame: number): string {
  const cycle = text.length + 8;
  const visible = frame % cycle;
  if (visible <= text.length) return text.slice(0, Math.max(1, visible));
  return text;
}

function renderInputBorder(position: "top" | "bottom", useColor: boolean): string {
  const terminalWidth = Math.max(48, Math.min(stdout.columns ?? 100, 120));
  const left = position === "top" ? "╭" : "╰";
  const right = position === "top" ? "╮" : "╯";
  const line = `${left}${"─".repeat(Math.max(0, terminalWidth - 2))}${right}`;
  return useColor ? `\x1b[38;2;84;94;112m${line}\x1b[0m` : line;
}

function renderWelcomeBanner(options: { model: string; cwd: string; color: boolean }): string {
  const width = 116;
  const leftWidth = 34;
  const rightWidth = width - leftWidth - 3;
  const title = ` LangCore v0.1.0 `;
  const top = `╭───${title}${"─".repeat(Math.max(0, width - title.length - 3))}╮`;
  const bottom = `╰${"─".repeat(width)}╯`;
  const lines = [
    ["", "我爱语核"],
    ["Welcome back!", "语核是面向工程实践的本地 Agent Runtime，先做好问答，再可靠地执行任务。"],
    ["", "它支持原生工具调用、上下文管理、权限审批、Skill、MCP 和多 Agent 协作。"],
    ["", "──────────────────────────────────────────────────────────────────────────────"],
    ["██    ██  ██    ██", "我爱语核"],
    [" ██  ██   ██    ██", "LangCore 让模型连接工作区：读写文件、运行测试、搜索网页、调用外部工具。"],
    ["  ████    ████████", "高价值操作默认需要人工介入，过程会在终端里清晰显示。"],
    ["   ██     ██    ██", "后续可通过 SDK 接入网页 demo，把流式输出和工具事件推到前端。"],
    ["   ██     ██    ██", ""],
    ["   ██     ██    ██", ""],
    [`${options.model} · API Usage Billing`, ""],
    [shortenHome(options.cwd), ""],
  ];

  const body = lines
    .map(([left, right]) => `│ ${center(left, leftWidth)} │ ${padRight(right, rightWidth)} │`)
    .join("\n");
  const banner = `${top}\n${body}\n${bottom}\n\n`;
  return options.color ? `\x1b[38;2;96;165;250m${banner}\x1b[0m` : banner;
}

function center(text: string, width: number): string {
  const length = displayLength(text);
  if (length >= width) return truncateDisplay(text, width);
  const left = Math.floor((width - length) / 2);
  const right = width - length - left;
  return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

function padRight(text: string, width: number): string {
  const normalized = truncateDisplay(text, width);
  return `${normalized}${" ".repeat(Math.max(0, width - displayLength(normalized)))}`;
}

function padDisplay(rawText: string, width: number, renderedText = rawText): string {
  return `${renderedText}${" ".repeat(Math.max(0, width - displayLength(rawText)))}`;
}

function truncateDisplay(text: string, width: number): string {
  if (displayLength(text) <= width) return text;
  let result = "";
  let length = 0;
  for (const char of text) {
    const charWidth = displayLength(char);
    if (length + charWidth > width - 1) break;
    result += char;
    length += charWidth;
  }
  return `${result}…`;
}

function displayLength(text: string): number {
  let length = 0;
  for (const char of text) {
    length += isWideChar(char) ? 2 : 1;
  }
  return length;
}

function isWideChar(char: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(char);
}

function shortenHome(cwd: string): string {
  const home = process.env.HOME;
  return home && cwd.startsWith(home) ? cwd.replace(home, "~") : cwd;
}

function parseCommandWords(inputText: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of inputText.matchAll(pattern)) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return words;
}

async function runWithRenderer<T>(renderer: CliTraceRenderer, fn: () => Promise<T>): Promise<T> {
  renderer.resetTurn();
  try {
    return await fn();
  } finally {
    renderer.finishTurn();
  }
}

async function readStdin(): Promise<string> {
  let data = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) {
    data += chunk;
  }
  return data;
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    verbose: true,
    yes: false,
    stream: true,
    color: process.stdout.isTTY && process.stderr.isTTY,
  };
  const taskParts: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      result.configPath = argv[++index];
    } else if (arg === "--verbose") {
      result.verbose = true;
    } else if (arg === "--quiet") {
      result.verbose = false;
    } else if (arg === "--yes") {
      result.yes = true;
    } else if (arg === "--no-stream") {
      result.stream = false;
    } else if (arg === "--no-color") {
      result.color = false;
    } else {
      taskParts.push(arg);
    }
  }
  if (taskParts.length > 0) result.task = taskParts.join(" ");
  return result;
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
