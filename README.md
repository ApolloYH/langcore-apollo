# LangCore Apollo

LangCore Apollo combines the local agent runtime and the web frontend into one workspace.

## Projects

- `agent/`: TypeScript agent runtime, CLI, tools, skills, MCP integration, and multi-agent worker runtime.
- `front/`: Next.js web interface connected to the agent runtime.

## Local Development

Run the agent CLI:

```bash
cd agent
npm run dev -- --config agent.config.example.json
```

Run the web frontend from the project root:

```bash
cd front
npm run dev
```

Then open:

```text
http://localhost:3000
```

If port `3000` is already in use, run it on another port:

```bash
cd front
npm run dev -- --port 3011
```

## Docker One-Command Start

From the repository root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

If local development servers already use those ports:

```bash
FRONT_PORT=3010 RAG_PORT=4010 docker compose up --build
```

The compose stack starts:

- `front`: Next.js web app plus the local agent runtime
- `rag-api`: semantic retrieval API
- `postgres`: pgvector-backed PostgreSQL database

Optional runtime credentials can stay in `agent/.env`, `front/.env`, or `front/.env.local`; Docker Compose reads those files at startup and does not bake them into the image. Common variables:

```bash
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.1
GITHUB_TOKEN=...
```

Stop the stack:

```bash
docker compose down
```
