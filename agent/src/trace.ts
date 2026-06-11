import { stderr } from "node:process";
import type { TraceEvent, TraceSink } from "./types.js";
import { truncate } from "./utils.js";

const color = {
  reset: "\x1b[0m",
  normal: "",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  blue: "\x1b[38;2;96;165;250m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

export type CliTraceOptions = {
  verbose: boolean;
  stream: boolean;
  color: boolean;
  status: boolean;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  beforeOutput?: () => void;
  afterOutput?: (text: string) => void;
  suspendLiveStatus?: () => boolean;
  staticStatus?: boolean;
};

export class CliTraceRenderer {
  private spinner?: NodeJS.Timeout;
  private spinnerIndex = 0;
  private statusText = "";
  private statusDetail = "";
  private statusLines = 0;
  private statusStartedAt = 0;
  private wroteAssistantText = false;
  private thoughtStartedAt = 0;
  private turnStartedAt = 0;
  private hasPrintedTurn = false;
  private turnSpacingPrinted = false;
  private lineBuffer = "";
  private staticStatusActive = false;

  constructor(private readonly options: CliTraceOptions) {}

  sink(): TraceSink {
    return (event) => this.render(event);
  }

  resetTurn(): void {
    this.stopStatus();
    this.wroteAssistantText = false;
    this.turnSpacingPrinted = false;
    this.lineBuffer = "";
    this.statusDetail = "";
    this.staticStatusActive = false;
    this.thoughtStartedAt = 0;
    this.turnStartedAt = Date.now();
  }

  finishTurn(): void {
    this.stopStatus();
    this.flushAssistantLine();
    if (this.wroteAssistantText) {
      this.out("\n");
      this.wroteAssistantText = false;
    }
    if (this.options.verbose && this.turnStartedAt) {
      this.bullet(`Completed in ${this.elapsedSince(this.turnStartedAt)}`, "green");
      this.out("\n");
    }
    this.hasPrintedTurn = true;
  }

  render(event: TraceEvent): void {
    if (!this.options.verbose && event.type !== "assistant_delta") return;

    switch (event.type) {
      case "assistant_delta":
        if (this.statusText === "thinking" && !this.statusDetail) {
          this.statusDetail = "receiving direct answer";
        }
        this.completeStatus();
        if (this.options.stream) {
          if (this.options.verbose) this.ensureTurnSpacing();
          this.writeAssistantDelta(event.text);
          this.wroteAssistantText = true;
        }
        break;
      case "llm_request":
        if (this.options.verbose) this.ensureTurnSpacing();
        this.thoughtStartedAt = Date.now();
        this.startStatus("thinking");
        break;
      case "llm_response":
        if (this.statusText === "thinking") {
          this.statusDetail = thoughtDetail(event.stopReason);
        }
        this.completeStatus();
        if (!this.options.stream && event.text) {
          if (this.options.verbose) this.ensureTurnSpacing();
          this.writeAssistantDelta(event.text);
          this.flushAssistantLine();
          this.out("\n");
        }
        break;
      case "tool_call":
        this.completeStatus();
        this.ensureTurnSpacing();
        this.startStatus(`using ${event.tool}`, `${riskLabel(event.risk)} ${compactToolInput(event.tool, event.input, 160)}`);
        break;
      case "tool_result":
        this.completeStatus(event.isError ? `${event.tool} failed ${compactValue(event.content, 240)}` : `${event.tool} done`, event.isError ? "normal" : "green");
        break;
      case "approval_required":
        this.completeStatus();
        break;
      case "approval_result":
        this.bullet(`${event.tool}: ${event.approved ? "approved" : "denied"}`, event.approved ? "green" : "normal");
        break;
      case "context_compacted":
        this.bullet(`context compacted ${event.beforeChars} -> ${event.afterChars} chars`, "green");
        break;
      case "worker_start":
        this.completeStatus();
        this.bullet(`Started ${event.worker}`, "green");
        this.subBullet(truncate(event.task, 160), "gray");
        break;
      case "worker_progress":
        // Worker internals are recorded for /agents. Printing every subagent
        // event inline makes parallel runs hard to read.
        break;
      case "worker_finish":
        this.completeStatus();
        this.bullet(`${event.worker} finished`, "green");
        break;
    }
  }

  private startStatus(text: string, detail = ""): void {
    this.statusText = text;
    this.statusDetail = detail;
    this.statusStartedAt = Date.now();
    if (this.options.staticStatus) {
      this.staticStatusActive = true;
      return;
    }
    if (!this.options.status || !this.options.stderr?.isTTY || this.options.suspendLiveStatus?.()) return;
    this.spinnerIndex = 0;
    this.spinner ??= setInterval(() => this.renderStatus(), 120);
    this.renderStatus();
  }

  private stopStatus(): void {
    if (!this.spinner) return;
    clearInterval(this.spinner);
    this.spinner = undefined;
    if (this.options.stderr?.isTTY && this.statusLines > 0) {
      this.clearStatusLines();
    }
    this.statusLines = 0;
  }

  private completeStatus(text = this.statusText, colorName: keyof typeof color = "green"): void {
    const hadStatus = this.spinner !== undefined || this.statusLines > 0 || Boolean(this.statusText);
    const detail = this.statusDetail;
    this.stopStatus();
    if (!hadStatus || !text) return;
    const elapsed = this.statusStartedAt ? ` ${this.elapsedSince(this.statusStartedAt)}` : "";
    if (this.options.staticStatus && this.staticStatusActive) {
      this.bullet(`${formatCompletedStatusText(text)}${elapsed}`, colorName);
      if (detail) this.subBullet(detail, "gray");
      this.statusText = "";
      this.statusDetail = "";
      this.staticStatusActive = false;
      this.statusStartedAt = 0;
      return;
    }
    this.bullet(`${formatCompletedStatusText(text)}${elapsed}`, colorName);
    if (detail) this.subBullet(detail, "gray");
    this.statusText = "";
    this.statusDetail = "";
    this.staticStatusActive = false;
    this.statusStartedAt = 0;
  }

  private renderStatus(): void {
    const frame = this.spinnerIndex;
    this.spinnerIndex += 1;
    const status = typewriterFrame(formatStatusText(this.statusText), frame);
    const elapsed = this.statusStartedAt ? this.elapsedSince(this.statusStartedAt) : this.elapsedThought();
    const statusColor = this.statusText === "thinking" ? "green" : "gray";
    this.out(`\r\x1b[2K${this.paint("•", statusColor)} ${this.paint(status, statusColor)} ${this.paint(elapsed, "gray")}`);
    this.statusLines = 1;
  }

  private bullet(text: string, colorName: keyof typeof color): void {
    this.stopStatus();
    this.flushAssistantLine();
    if (this.wroteAssistantText) {
      this.out("\n");
      this.wroteAssistantText = false;
    }
    this.out(`${this.paint("•", colorName)} ${this.paint(text, colorName)}\n`);
  }

  private subBullet(text: string, colorName: keyof typeof color): void {
    this.stopStatus();
    this.flushAssistantLine();
    if (this.wroteAssistantText) {
      this.out("\n");
      this.wroteAssistantText = false;
    }
    this.out(`  ${this.paint("└", colorName)} ${this.paint(text, colorName)}\n`);
  }

  private paint(text: string, colorName: keyof typeof color): string {
    if (!this.options.color) return text;
    if (colorName === "normal") return text;
    return `${color[colorName]}${text}${color.reset}`;
  }

  private elapsedThought(): string {
    if (!this.thoughtStartedAt) return "0.0s";
    return `${((Date.now() - this.thoughtStartedAt) / 1000).toFixed(1)}s`;
  }

  private elapsedSince(startedAt: number): string {
    return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  }

  private writeAssistantDelta(text: string): void {
    this.lineBuffer += text;
    let newlineIndex = this.lineBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.lineBuffer.slice(0, newlineIndex);
      this.out(`${renderTerminalMarkdownLine(line)}\n`);
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      newlineIndex = this.lineBuffer.indexOf("\n");
    }
  }

  private flushAssistantLine(): void {
    if (!this.lineBuffer) return;
    this.out(renderTerminalMarkdownLine(this.lineBuffer));
    this.lineBuffer = "";
  }

  private ensureTurnSpacing(): void {
    if (this.turnSpacingPrinted) return;
    this.out(this.hasPrintedTurn ? "\n" : "\n");
    this.turnSpacingPrinted = true;
  }

  private clearStatusLines(): void {
    if (this.statusLines === 2) {
      this.out("\r\x1b[2K\x1b[1F\r\x1b[2K");
      return;
    }
    this.out("\r\x1b[2K");
  }

  private out(text: string): void {
    this.options.beforeOutput?.();
    (this.options.stdout ?? process.stdout).write(text);
    this.options.afterOutput?.(text);
  }

  private err(text: string): void {
    (this.options.stderr ?? stderr).write(text);
  }
}

export function renderTraceEvent(event: TraceEvent): void {
  new CliTraceRenderer({
    verbose: true,
    stream: false,
    color: stderr.isTTY,
    status: false,
  }).render(event);
}

export function createCliTraceSink(verbose: boolean): TraceSink {
  return new CliTraceRenderer({
    verbose,
    stream: false,
    color: stderr.isTTY,
    status: false,
  }).sink();
}

function riskColor(risk: string): keyof typeof color {
  if (risk === "high") return "red";
  if (risk === "medium") return "yellow";
  return "green";
}

function riskLabel(risk: string): string {
  if (risk === "high") return "high risk";
  if (risk === "medium") return "medium risk";
  return "low risk";
}

function renderTerminalMarkdownLine(line: string): string {
  let rendered = line;
  rendered = rendered.replace(/^\s{0,3}#{1,6}\s+/, "");
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "$1");
  rendered = rendered.replace(/__([^_]+)__/g, "$1");
  rendered = rendered.replace(/`([^`]+)`/g, "$1");
  rendered = rendered.replace(/^\s{0,3}[-*+]\s+/, "  • ");
  rendered = rendered.replace(/^\s{0,3}>\s?/, "  ");
  return rendered;
}

function compactValue(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function compactToolInput(tool: string, value: unknown, max: number): string {
  if (tool === "delegate_to_worker" && value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    const worker = typeof input.worker === "string" ? input.worker : "worker";
    const description = typeof input.description === "string" ? input.description : "subtask";
    return compactValue({ worker, description }, max);
  }
  return compactValue(value, max);
}

function typewriterFrame(text: string, frame: number): string {
  const cycle = text.length + 6;
  const visible = frame % cycle;
  if (visible <= text.length) return text.slice(0, visible || 1);
  return text;
}

function formatStatusText(text: string): string {
  if (text === "thinking") return "Thinking...";
  if (text.startsWith("running ")) return `Running ${text.slice("running ".length)}...`;
  if (text.startsWith("using ")) return `Using ${text.slice("using ".length)}...`;
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}...`;
}

function formatCompletedStatusText(text: string): string {
  if (text === "thinking") return "Thought";
  if (text.startsWith("using ")) return `Used ${text.slice("using ".length)}`;
  if (text.startsWith("running ")) return `Ran ${text.slice("running ".length)}`;
  return text;
}

function thoughtDetail(stopReason?: string): string {
  if (stopReason === "tool_use") return "model requested tool use";
  if (stopReason === "max_tokens") return "model reached max token limit";
  if (stopReason === "end_turn") return "answered directly, no tools used";
  return stopReason ? `stopped by ${stopReason}` : "model response received";
}
