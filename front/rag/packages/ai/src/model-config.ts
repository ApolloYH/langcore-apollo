import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_LLM_MODEL = "claude-haiku-4-5";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export interface AnthropicCompatibleClientOptions {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
}

export function resolveModel(model?: string) {
  return model ?? process.env.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? DEFAULT_LLM_MODEL;
}

export function resolveAnthropicToken(options: Pick<AnthropicCompatibleClientOptions, "apiKey" | "authToken"> = {}) {
  return options.apiKey ?? options.authToken ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
}

export function createAnthropicCompatibleClient(options: AnthropicCompatibleClientOptions = {}) {
  const token = resolveAnthropicToken(options);

  return new Anthropic({
    apiKey: token,
    authToken: options.authToken ?? process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: options.baseURL ?? process.env.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL
  });
}
