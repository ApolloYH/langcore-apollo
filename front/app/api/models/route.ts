import { NextResponse } from "next/server";

export type AgentModel = {
  id: string;
  name: string;
  provider: "langcore" | "kimi" | "openai";
};

const models: AgentModel[] = [
  { id: "langcore-agent", name: "LangCore Agent", provider: "langcore" },
  { id: "kimi-k2-agent", name: "Kimi K2.6 Agent", provider: "kimi" },
  { id: "chatgpt-agent", name: "ChatGPT Agent", provider: "openai" },
  { id: "openai-agent", name: "OpenAI Agent", provider: "openai" }
];

export async function GET() {
  return NextResponse.json({ models });
}
