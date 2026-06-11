import type { Message, TraceSink } from "../types.js";
import { estimateChars, truncate } from "../utils.js";

export class ContextManager {
  private summary = "";

  constructor(
    private readonly options: { maxChars: number; summaryChars: number },
    private readonly emit: TraceSink,
  ) {}

  compact(messages: Message[]): Message[] {
    const beforeChars = estimateChars({ summary: this.summary, messages });
    if (beforeChars <= this.options.maxChars || messages.length < 8) return messages;

    const keepCount = Math.max(6, Math.floor(messages.length / 3));
    const older = messages.slice(0, -keepCount);
    const recent = messages.slice(-keepCount);
    const olderText = older
      .map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`)
      .join("\n");

    this.summary = truncate(`${this.summary}\n${olderText}`, this.options.summaryChars);
    const compacted: Message[] = [
      {
        role: "user",
        content: `Context summary from earlier turns:\n${this.summary}`,
      },
      ...recent,
    ];
    this.emit({
      type: "context_compacted",
      beforeChars,
      afterChars: estimateChars({ summary: this.summary, messages: compacted }),
    });
    return compacted;
  }

  clear(): void {
    this.summary = "";
  }
}
