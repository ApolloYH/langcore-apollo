import type { AnthropicTool, ContentBlock, LlmConfig, Message } from "../types.js";

export type AnthropicResponse = {
  id: string;
  type: string;
  role: "assistant";
  content: ContentBlock[];
  stop_reason?: string;
};

type StreamContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; inputJson: string };

export class AnthropicClient {
  constructor(private readonly config: LlmConfig) {}

  async createMessage(input: {
    system: string;
    messages: Message[];
    tools: AnthropicTool[];
    stream?: boolean;
    onTextDelta?: (text: string) => void;
  }): Promise<AnthropicResponse> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/v1/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": this.config.authToken,
        authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: input.system,
        messages: input.messages,
        tools: input.tools,
        tool_choice: { type: "auto" },
        stream: input.stream ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }
    if (input.stream) {
      return readStreamingResponse(response, input.onTextDelta);
    }
    return (await response.json()) as AnthropicResponse;
  }
}

async function readStreamingResponse(response: Response, onTextDelta?: (text: string) => void): Promise<AnthropicResponse> {
  if (!response.body) throw new Error("Anthropic API returned an empty stream body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const blocks = new Map<number, StreamContentBlock>();
  let buffer = "";
  let responseId = "";
  let stopReason: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const data = parseSseData(rawEvent);
      if (data && data !== "[DONE]") {
        const event = JSON.parse(data) as Record<string, unknown>;
        if (event.type === "error") {
          throw new Error(`Anthropic stream error: ${JSON.stringify(event.error ?? event)}`);
        }
        applyStreamEvent(event, blocks, (id) => {
          responseId = id;
        }, (reason) => {
          stopReason = reason;
        }, onTextDelta);
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    const data = parseSseData(buffer);
    if (data && data !== "[DONE]") {
      const event = JSON.parse(data) as Record<string, unknown>;
      applyStreamEvent(event, blocks, (id) => {
        responseId = id;
      }, (reason) => {
        stopReason = reason;
      }, onTextDelta);
    }
  }

  return {
    id: responseId,
    type: "message",
    role: "assistant",
    content: Array.from(blocks.entries())
      .sort(([left], [right]) => left - right)
      .map(([, block]) => finalizeStreamBlock(block)),
    stop_reason: stopReason,
  };
}

function parseSseData(rawEvent: string): string {
  return rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();
}

function applyStreamEvent(
  event: Record<string, unknown>,
  blocks: Map<number, StreamContentBlock>,
  setResponseId: (id: string) => void,
  setStopReason: (reason: string) => void,
  onTextDelta?: (text: string) => void,
): void {
  if (event.type === "message_start") {
    const message = event.message as { id?: string } | undefined;
    if (message?.id) setResponseId(message.id);
    return;
  }
  if (event.type === "message_delta") {
    const delta = event.delta as { stop_reason?: string } | undefined;
    if (delta?.stop_reason) setStopReason(delta.stop_reason);
    return;
  }
  if (event.type === "content_block_start") {
    const index = Number(event.index);
    const contentBlock = event.content_block as Partial<ContentBlock> | undefined;
    if (!Number.isFinite(index) || !contentBlock) return;
    if (contentBlock.type === "text") {
      blocks.set(index, { type: "text", text: contentBlock.text ?? "" });
    } else if (contentBlock.type === "tool_use") {
      blocks.set(index, {
        type: "tool_use",
        id: contentBlock.id ?? "",
        name: contentBlock.name ?? "",
        inputJson: "",
      });
    }
    return;
  }
  if (event.type !== "content_block_delta") return;

  const index = Number(event.index);
  const block = blocks.get(index);
  const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined;
  if (!block || !delta) return;

  if (block.type === "text" && delta.type === "text_delta" && delta.text) {
    block.text += delta.text;
    onTextDelta?.(delta.text);
  } else if (block.type === "tool_use" && delta.type === "input_json_delta" && delta.partial_json) {
    block.inputJson += delta.partial_json;
  }
}

function finalizeStreamBlock(block: StreamContentBlock): ContentBlock {
  if (block.type === "text") return block;
  return {
    type: "tool_use",
    id: block.id,
    name: block.name,
    input: block.inputJson.trim() ? JSON.parse(block.inputJson) : {},
  };
}
