import { sql } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  vector
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
});

export const repositories = pgTable(
  "repositories",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull().unique(),
    provider: text("provider"),
    owner: text("owner"),
    name: text("name").notNull(),
    defaultBranch: text("default_branch"),
    description: text("description"),
    stars: integer("stars").default(0),
    forks: integer("forks").default(0),
    primaryLanguage: text("primary_language"),
    lastCommitSha: text("last_commit_sha"),
    clonedPath: text("cloned_path"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_repositories_owner_name").on(table.owner, table.name)]
);

export const healthAssessments = pgTable(
  "health_assessments",
  {
    id: serial("id").primaryKey(),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    overallScore: doublePrecision("overall_score"),
    summary: text("summary"),
    metricsJson: jsonb("metrics_json"),
    findingsJson: jsonb("findings_json"),
    model: text("model"),
    startedAt: timestamp("started_at", { mode: "string", withTimezone: true }),
    completedAt: timestamp("completed_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_health_assessments_repo_created").on(table.repositoryId, sql`${table.createdAt} DESC`)]
);

export const researchReports = pgTable(
  "research_reports",
  {
    id: serial("id").primaryKey(),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    reportMarkdown: text("report_markdown"),
    reportJson: jsonb("report_json"),
    model: text("model"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_research_reports_repo_created").on(table.repositoryId, sql`${table.createdAt} DESC`)]
);

export const repoEmbeddings = pgTable(
  "repo_embeddings",
  {
    id: serial("id").primaryKey(),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourcePath: text("source_path").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    contentHash: text("content_hash").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    dimensions: integer("dimensions").notNull(),
    vector: bytea("vector").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("repo_embeddings_repository_id_source_path_chunk_index_embedding_model_unique").on(
      table.repositoryId,
      table.sourcePath,
      table.chunkIndex,
      table.embeddingModel
    ),
    index("idx_repo_embeddings_repo_model").on(table.repositoryId, table.embeddingModel),
    index("idx_repo_embeddings_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops"))
  ]
);

export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("watchlist_user_id_repository_id_unique").on(table.userId, table.repositoryId),
    index("idx_watchlist_user").on(table.userId)
  ]
);
