CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "health_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository_id" integer NOT NULL,
	"user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"overall_score" double precision,
	"summary" text,
	"metrics_json" jsonb,
	"findings_json" jsonb,
	"model" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository_id" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_path" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding_model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"vector" "bytea" NOT NULL,
	"embedding" vector(1536),
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_embeddings_repository_id_source_path_chunk_index_embedding_model_unique" UNIQUE("repository_id","source_path","chunk_index","embedding_model")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"provider" text,
	"owner" text,
	"name" text NOT NULL,
	"default_branch" text,
	"description" text,
	"stars" integer DEFAULT 0,
	"forks" integer DEFAULT 0,
	"primary_language" text,
	"last_commit_sha" text,
	"cloned_path" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "research_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository_id" integer NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"report_markdown" text,
	"report_json" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"repository_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_repository_id_unique" UNIQUE("user_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "health_assessments" ADD CONSTRAINT "health_assessments_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_assessments" ADD CONSTRAINT "health_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_embeddings" ADD CONSTRAINT "repo_embeddings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_health_assessments_repo_created" ON "health_assessments" USING btree ("repository_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_repo_embeddings_repo_model" ON "repo_embeddings" USING btree ("repository_id","embedding_model");--> statement-breakpoint
CREATE INDEX "idx_repo_embeddings_embedding_hnsw" ON "repo_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_repositories_owner_name" ON "repositories" USING btree ("owner","name");--> statement-breakpoint
CREATE INDEX "idx_research_reports_repo_created" ON "research_reports" USING btree ("repository_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_watchlist_user" ON "watchlist" USING btree ("user_id");
