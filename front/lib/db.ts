import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://langcore:langcore_password@localhost:5432/langcore";

const pool = new Pool({
  connectionString
});

let schemaReady: Promise<void> | null = null;

export type UserRecord = {
  created_at: string;
  id: number;
  last_login_at: string;
  name: string;
  password_hash?: string | null;
  password_salt?: string | null;
};

export type RepoEmbeddingSearchResult = {
  chunk_index: number;
  chunk_text: string;
  distance: number;
  id: number;
  repository_id: number;
  source_path: string;
  source_type: string;
};

export async function loginUser(name: string, password: string) {
  await ensureSchema();
  const normalized = name.trim();
  const user = await findUser(normalized);

  if (!user || !user.password_hash || !user.password_salt || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return null;
  }

  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP
      WHERE name = $1
      RETURNING id, name, created_at, last_login_at
    `,
    [normalized]
  );

  return result.rows[0] ?? null;
}

export async function registerUser(name: string, password: string) {
  await ensureSchema();
  const normalized = name.trim();

  if (await findUser(normalized)) {
    return null;
  }

  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const result = await pool.query<UserRecord>(
    `
      INSERT INTO users (name, password_hash, password_salt, last_login_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      RETURNING id, name, created_at, last_login_at
    `,
    [normalized, hash, salt]
  );

  return result.rows[0] ?? null;
}

export async function findUser(name: string) {
  await ensureSchema();
  const result = await pool.query<UserRecord>(
    `
      SELECT id, name, password_hash, password_salt, created_at, last_login_at
      FROM users
      WHERE name = $1
    `,
    [name]
  );

  return result.rows[0];
}

export async function ensureSchema() {
  schemaReady ??= createSchema();
  return schemaReady;
}

async function createSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      provider TEXT,
      owner TEXT,
      name TEXT NOT NULL,
      default_branch TEXT,
      description TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      primary_language TEXT,
      last_commit_sha TEXT,
      cloned_path TEXT,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS health_assessments (
      id SERIAL PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      overall_score DOUBLE PRECISION,
      summary TEXT,
      metrics_json JSONB,
      findings_json JSONB,
      model TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS research_reports (
      id SERIAL PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      report_markdown TEXT,
      report_json JSONB,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repo_embeddings (
      id SERIAL PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector BYTEA NOT NULL,
      embedding vector(1536),
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (repository_id, source_path, chunk_index, embedding_model)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, repository_id)
    );

    CREATE INDEX IF NOT EXISTS idx_repositories_owner_name ON repositories(owner, name);
    CREATE INDEX IF NOT EXISTS idx_health_assessments_repo_created ON health_assessments(repository_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_reports_repo_created ON research_reports(repository_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_repo_embeddings_repo_model ON repo_embeddings(repository_id, embedding_model);
    CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
  `);

  await pool.query("ALTER TABLE repo_embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536)");
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_repo_embeddings_embedding_hnsw
    ON repo_embeddings
    USING hnsw (embedding vector_cosine_ops)
  `);
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encodeEmbedding(vector: Float32Array | number[]) {
  const floatVector = vector instanceof Float32Array ? vector : Float32Array.from(vector);
  return Buffer.from(floatVector.buffer, floatVector.byteOffset, floatVector.byteLength);
}

export function decodeEmbedding(blob: Buffer) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function toPgVector(vector: Float32Array | number[]) {
  const values = Array.from(vector, (value) => {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding vector contains a non-finite value");
    }

    return Number(value).toString();
  });

  return `[${values.join(",")}]`;
}

export async function searchRepoEmbeddings(input: {
  embeddingModel?: string;
  limit?: number;
  queryVector: Float32Array | number[];
  repositoryId?: number;
}) {
  await ensureSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const params: Array<number | string> = [toPgVector(input.queryVector)];
  const filters: string[] = ["embedding IS NOT NULL"];

  if (input.repositoryId) {
    params.push(input.repositoryId);
    filters.push(`repository_id = $${params.length}`);
  }

  if (input.embeddingModel) {
    params.push(input.embeddingModel);
    filters.push(`embedding_model = $${params.length}`);
  }

  params.push(limit);
  const limitParam = params.length;

  const result = await pool.query<RepoEmbeddingSearchResult>(
    `
      SELECT
        id,
        repository_id,
        source_type,
        source_path,
        chunk_index,
        chunk_text,
        embedding <=> $1::vector AS distance
      FROM repo_embeddings
      WHERE ${filters.join(" AND ")}
      ORDER BY embedding <=> $1::vector
      LIMIT $${limitParam}
    `,
    params
  );

  return result.rows;
}
