# LangCore Front

## Overview

This project is a Next.js TypeScript full-stack prototype for a ChatGPT-like LangCore agent interface.

## Stack

- Next.js App Router
- React
- TypeScript
- PostgreSQL + pgvector via Docker and `pg`
- Lucide React icons

## Commands

```bash
npm run db:up
npm run dev
npm run typecheck
npm run build
npm run db:down
```

The local dev server runs on:

```text
http://localhost:3000
```

## Database

PostgreSQL is used for persistence and runs through Docker Compose.

Default connection string:

```text
postgres://langcore:langcore_password@localhost:5432/langcore
```

Configure it with:

```text
DATABASE_URL
```

User records are managed in:

```text
lib/db.ts
```

Passwords are stored as salted hashes, not plaintext.

## API Routes

- `POST /api/auth/login` handles login and registration.
- `POST /api/chat` returns the mock agent response and thought steps.
- `GET /api/models` returns available model options.
- `GET /api/workspace` returns the current agent workspace path.

## UI Notes

- The interface follows a compact ChatGPT-style layout.
- The sidebar supports expanded and collapsed states.
- The top `LangCore` selector displays the current agent work directory.
- Quick actions include deep thinking and quick assessment.
- The chat API response reserves a `thoughts` field for future agent reasoning, tool calls, or retrieval traces.
