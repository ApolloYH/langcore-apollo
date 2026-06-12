import { NextResponse } from "next/server";

type RagProxyRequest =
  | {
      action: "github.ingest";
      input: {
        force?: boolean;
        githubUrl?: string;
        maxHnDiscussions?: number;
        owner?: string;
        repo?: string;
      };
    }
  | {
      action: "document.ingestPdf";
      input: {
        filePath: string;
        owner?: string;
        repo?: string;
      };
    }
  | {
      action: "semantic.search";
      input: {
        limit?: number;
        minSimilarity?: number;
        owner?: string;
        query: string;
        repo?: string;
      };
    };

const devscopeApiBase =
  process.env.DEVSCOPE_API_URL ?? process.env.RAG_API_URL ?? process.env.NEXT_PUBLIC_RAG_API_URL ?? "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<RagProxyRequest>;

  if (!body.action || !body.input) {
    return NextResponse.json({ error: "Invalid RAG request." }, { status: 400 });
  }

  try {
    const response = await fetch(`${devscopeApiBase.replace(/\/$/, "")}/trpc/${body.action}`, {
      body: JSON.stringify(body.input),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(120_000)
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      return NextResponse.json({ error: trpcErrorMessage(payload) || `RAG API failed: ${response.status}` }, { status: 502 });
    }

    return NextResponse.json({ data: unwrapTrpcPayload(payload) });
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : "unknown error";
    return NextResponse.json(
      {
        error: `RAG API 未启动或不可访问：${devscopeApiBase}。请先启动语义检索后端服务。原始错误：${detail}`
      },
      { status: 502 }
    );
  }
}

function unwrapTrpcPayload(payload: unknown) {
  if (payload && typeof payload === "object" && "result" in payload) {
    const result = (payload as { result?: { data?: unknown } }).result;
    if (result && "data" in result) {
      return result.data;
    }
  }

  return payload;
}

function trpcErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const error = (payload as { error?: { message?: string } }).error;
  return error?.message ?? "";
}
