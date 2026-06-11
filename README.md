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

Run the web frontend:

```bash
cd front
npm run dev
```
