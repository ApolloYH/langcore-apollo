# LangCore Front API Contract

This document describes the API contract currently used by the LangCore frontend.

Base URL in development:

```text
http://localhost:3000
```

When connecting a separate backend, keep the same paths and JSON shapes, or update the frontend fetch calls in `app/page.tsx`.

## 1. Login / Register

```http
POST /api/auth/login
Content-Type: application/json
```

### Request

```ts
type AuthRequest = {
  action: "login" | "register";
  name: string;
  password: string;
};
```

Example:

```json
{
  "action": "register",
  "name": "Apollo YH",
  "password": "secret123"
}
```

### Success Response

```ts
type AuthResponse = {
  user: {
    id: number;
    name: string;
    created_at?: string;
    last_login_at?: string;
  };
};
```

Example:

```json
{
  "user": {
    "id": 1,
    "name": "Apollo YH",
    "created_at": "2026-06-11 12:00:00",
    "last_login_at": "2026-06-11 12:00:00"
  }
}
```

### Error Responses

```json
{ "error": "Name is required" }
```

```json
{ "error": "Password is required" }
```

```json
{ "error": "Password length is invalid" }
```

```json
{ "error": "User already exists" }
```

```json
{ "error": "Invalid credentials" }
```

Expected status codes:

- `200` success
- `400` invalid input
- `409` login/register conflict or invalid credentials

## 2. Chat

```http
POST /api/chat
Content-Type: application/json
```

### Request

```ts
type ChatRequest = {
  autoApprove?: boolean;
  message: string;
  model: string;
};
```

Example:

```json
{
  "autoApprove": false,
  "message": "帮我分析这个项目",
  "model": "langcore-agent"
}
```

### Success Response

The route returns newline-delimited JSON streaming events:

```http
Content-Type: application/x-ndjson; charset=utf-8
```

```ts
type ThoughtStep = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "running" | "waiting";
};

type ChatStreamEvent =
  | { type: "start"; id: string; model: string }
  | { type: "thought"; thought: ThoughtStep }
  | { type: "approval"; approval: ApprovalItem }
  | { type: "delta"; text: string }
  | { type: "done"; id: string; model: string; content: string }
  | { type: "error"; error: string };

type ApprovalItem = {
  id: string;
  tool: string;
  risk: "low" | "medium" | "high";
  reason: string;
  input: string;
  status?: "pending" | "approved" | "denied";
};
```

Example:

```ndjson
{"type":"start","id":"assistant-1781150000000","model":"langcore-agent"}
{"type":"thought","thought":{"id":"llm_request-...","title":"思考中 turn 1","detail":"可用工具 17 个","status":"running"}}
{"type":"approval","approval":{"id":"approval-...","tool":"shell_exec","risk":"high","reason":"Tool shell_exec requested by the model.","input":"{\"command\":\"npm test\"}"}}
{"type":"delta","text":"这是"}
{"type":"delta","text":" agent"}
{"type":"done","id":"assistant-1781150000000","model":"langcore-agent","content":"这是 agent 的最终回答。"}
```

### Frontend Requirements

- Append `delta.text` to the assistant answer as it arrives.
- Display `thought.thought` in the "Agent 思考过程" panel.
- Display `approval.approval` as an inline approval card. Submit the user's decision to `POST /api/chat/approval`.
- `thought` events include model turns, tool calls/results, approvals, context compaction, and worker lifecycle events.
- Use `done.content` as the final reconciled assistant answer.
- `error.error` should be shown on the current assistant message.

### Error Response

```json
{ "error": "Message is required" }
```

Expected status codes:

- `200` success
- `400` invalid input
- `500` backend failure

## 3. Chat Approval

```http
POST /api/chat/approval
Content-Type: application/json
```

### Request

```ts
type ApprovalDecision = {
  id: string;
  approved: boolean;
};
```

Example:

```json
{
  "id": "approval-1781150000000-abcd123",
  "approved": true
}
```

Expected status codes:

- `200` approval settled
- `400` invalid input
- `404` approval request not found or expired

## 4. Models

```http
GET /api/models
```

### Success Response

```ts
type AgentModel = {
  id: string;
  name: string;
  provider: "langcore" | "kimi" | "openai";
};

type ModelsResponse = {
  models: AgentModel[];
};
```

Example:

```json
{
  "models": [
    {
      "id": "langcore-agent",
      "name": "LangCore Agent",
      "provider": "langcore"
    },
    {
      "id": "kimi-k2-agent",
      "name": "Kimi K2.6 Agent",
      "provider": "kimi"
    },
    {
      "id": "chatgpt-agent",
      "name": "ChatGPT Agent",
      "provider": "openai"
    }
  ]
}
```

## 5. Workspace

```http
GET /api/workspace
```

This endpoint powers the top-left `LangCore` workspace dropdown.

### Success Response

```ts
type WorkspaceResponse = {
  name: string;
  path: string;
};
```

Example:

```json
{
  "name": "LangCore",
  "path": "/Users/apollo/Code-YH/langcore/front"
}
```

## Current Frontend Fetch Locations

All current fetch calls are in:

```text
app/page.tsx
```

Current calls:

```ts
fetch("/api/models")
fetch("/api/workspace")
fetch("/api/auth/login", { method: "POST", ... })
fetch("/api/chat", { method: "POST", ... })
```

## Backend Integration Notes

If the backend runs on another origin, configure either:

- a Next.js API proxy that keeps the frontend paths unchanged, or
- replace the relative paths in `app/page.tsx` with your backend base URL.

Recommended environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:YOUR_BACKEND_PORT
```

`/api/chat` already streams NDJSON. If a separate backend replaces the local route, keep the `ChatStreamEvent` sequence compatible with the frontend parser.
