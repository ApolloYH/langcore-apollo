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
