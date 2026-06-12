# Database Schema

PostgreSQL is used for persistence and runs through Docker Compose. The Docker image includes `pgvector` for semantic search.

Start it with:

```bash
npm run db:up
```

Default connection string:

```text
postgres://langcore:langcore_password@localhost:5432/langcore
```

The app reads `DATABASE_URL` when present.

## Drizzle Migrations

The database schema is defined in TypeScript at:

```text
db/schema.ts
```

Drizzle Kit generates SQL migrations into:

```text
drizzle/
```

Useful commands:

```bash
npm run db:generate
npm run db:migrate
```

`db:generate` reads `db/schema.ts` and writes a new SQL migration.
`db:migrate` applies pending migrations to the PostgreSQL database configured by `DATABASE_URL`.

For a fresh database, run:

```bash
npm run db:migrate
```

If the database was already initialized by the older `lib/db.ts` runtime `CREATE TABLE IF NOT EXISTS` path, the initial Drizzle migration will fail because the tables already exist. For local development, reset the Docker volume or use a fresh database before applying the initial migration. For a production database that already has these tables, create a migration baseline instead of replaying `0000_overconfident_firedrake.sql`.

The initial migration enables `pgvector` explicitly:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is required before creating the `embedding vector(1536)` column and HNSW index.

## Core Tables

### `users`

Stores local frontend users.

Important columns:

- `id`
- `name`
- `password_hash`
- `password_salt`
- `created_at`
- `last_login_at`

Passwords are stored as salted `scrypt` hashes.

### `repositories`

Stores repository metadata.

Important columns:

- `id`
- `url`
- `provider`
- `owner`
- `name`
- `default_branch`
- `description`
- `stars`
- `forks`
- `primary_language`
- `last_commit_sha`
- `cloned_path`
- `metadata_json`
- `created_at`
- `updated_at`

### `health_assessments`

Stores health assessment history for repositories.

Important columns:

- `id`
- `repository_id`
- `user_id`
- `status`
- `overall_score`
- `summary`
- `metrics_json`
- `findings_json`
- `model`
- `started_at`
- `completed_at`
- `created_at`

### `research_reports`

Stores deep research reports.

Important columns:

- `id`
- `repository_id`
- `user_id`
- `title`
- `status`
- `report_markdown`
- `report_json`
- `model`
- `created_at`
- `updated_at`

### `repo_embeddings`

Stores embedding vectors for repository chunks.

Important columns:

- `id`
- `repository_id`
- `source_type`
- `source_path`
- `chunk_index`
- `chunk_text`
- `content_hash`
- `embedding_model`
- `dimensions`
- `vector`
- `embedding`
- `metadata_json`
- `created_at`

## Embedding Storage

Embeddings are stored in two forms:

- `vector BYTEA`: raw `Float32Array` bytes for lossless storage and export.
- `embedding vector(1536)`: pgvector search column for cosine similarity search.

The app can convert vectors to raw bytes like this:

```ts
const vector = Float32Array.from([0.1, 0.2, 0.3]);
const blob = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
```

To read the vector back:

```ts
const vector = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
```

This is more compact and faster than storing embeddings as JSON text. For example:

- 1536 dimensions as `Float32Array` = about 6 KB
- 1536 dimensions as JSON text = often 25 KB or more

The current schema stores:

- `vector BYTEA NOT NULL`: raw `Float32Array` bytes
- `embedding vector(1536)`: searchable pgvector column
- `dimensions INTEGER NOT NULL`: vector length
- `embedding_model TEXT NOT NULL`: model used to generate the vector
- `content_hash TEXT NOT NULL`: detects whether a chunk changed and needs re-embedding

Similarity search can be done directly in SQL:

```sql
SELECT
  id,
  source_path,
  chunk_index,
  chunk_text,
  embedding <=> $1::vector AS distance
FROM repo_embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

`<=>` is pgvector cosine distance when the HNSW index uses `vector_cosine_ops`.

An HNSW index is created for semantic search:

```sql
CREATE INDEX IF NOT EXISTS idx_repo_embeddings_embedding_hnsw
ON repo_embeddings
USING hnsw (embedding vector_cosine_ops);
```

For now the searchable column is `vector(1536)`, which matches common 1536-dimensional embedding models. If a different embedding dimension is used, create a matching column or migrate this column dimension.

### `watchlist`

Stores repositories followed by users.

Important columns:

- `id`
- `user_id`
- `repository_id`
- `note`
- `created_at`
