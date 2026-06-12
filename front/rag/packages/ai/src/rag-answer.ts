import Anthropic from "@anthropic-ai/sdk";
import type { SearchResult } from "@devscope/shared";

import { createAnthropicCompatibleClient, resolveAnthropicToken, resolveModel } from "./model-config";

type MessagesClient = Pick<Anthropic["messages"], "create">;

export interface RagAnswerOptions {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  client?: MessagesClient;
  maxTokens?: number;
  model?: string;
}

export async function generateRagAnswer(
  query: string,
  results: SearchResult[],
  options: RagAnswerOptions = {}
): Promise<string> {
  if (results.length === 0) {
    return "No matching repository context has been ingested yet.";
  }

  const client = options.client ?? createOptionalAnthropicClient(options)?.messages;
  if (!client) {
    return createLocalRagAnswer(query, results);
  }

  try {
    const response = await client.create({
      max_tokens: options.maxTokens ?? 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Answer the user question using only the provided repository and Hacker News context.",
                "Cite source titles inline and mention source URLs when useful. If context is insufficient, say what is missing.",
                `Question: ${query}`,
                "Context:",
                ...results.map(
                  (result, index) =>
                    `[${index + 1}] ${result.title} (${result.sourceType}, score ${result.score.toFixed(3)}, url ${
                      result.sourceUrl ?? "none"
                    }):\n${result.content}`
                )
              ].join("\n\n")
            }
          ]
        }
      ],
      model: resolveModel(options.model)
    });

    const text = response.content.find((block) => block.type === "text");
    if (!text) {
      throw new Error("Claude did not return a text answer.");
    }

    return text.text;
  } catch (error) {
    if (isAuthenticationError(error)) {
      return createLocalRagAnswer(query, results);
    }
    throw error;
  }
}

function createOptionalAnthropicClient(options: Pick<RagAnswerOptions, "apiKey" | "authToken" | "baseURL">) {
  const token = resolveAnthropicToken(options);
  if (!token) {
    return null;
  }

  return createAnthropicCompatibleClient({ apiKey: token, authToken: options.authToken, baseURL: options.baseURL });
}

function createLocalRagAnswer(query: string, results: SearchResult[]) {
  const topResults = results.slice(0, 5);
  const sourceSummary = topResults
    .map((result, index) => {
      const content = compactWhitespace(result.content).slice(0, 700);
      const url = result.sourceUrl ? `\n   来源: ${result.sourceUrl}` : "";
      return `${index + 1}. ${result.title}（${result.sourceType}, score ${result.score.toFixed(3)}）${url}\n   ${content}`;
    })
    .join("\n\n");

  return [
    "当前没有可用的 LLM 认证配置，先返回基于向量检索结果的本地摘要。",
    "",
    `问题: ${query}`,
    "",
    "最相关证据:",
    sourceSummary,
    "",
    "要生成完整综合回答，请在 agent/.env 或 front/.env 配置 ANTHROPIC_AUTH_TOKEN、ANTHROPIC_BASE_URL、ANTHROPIC_DEFAULT_HAIKU_MODEL 后重启 npm run dev。"
  ].join("\n");
}

function compactWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /authentication|auth|api.?key|auth.?token|authorization|x-api-key/i.test(message);
}
