package database

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// migrations holds SQL statements to run in order.
// Each entry is a pair: [name, sql].
var migrations = []struct {
	Name string
	SQL  string
}{
	{
		Name: "001_create_users",
		SQL: `
			CREATE TABLE IF NOT EXISTS users (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name          VARCHAR(255) NOT NULL,
				email         VARCHAR(255) NOT NULL UNIQUE,
				password_hash VARCHAR(255) NOT NULL,
				created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
				updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
		`,
	},
	{
		Name: "002_create_bots",
		SQL: `
			CREATE TABLE IF NOT EXISTS bots (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				name          VARCHAR(255) NOT NULL,
				description   TEXT         DEFAULT '',
				status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
				bot_token     VARCHAR(64)  UNIQUE,
				settings      JSONB        DEFAULT '{}',
				created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
				updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
			CREATE INDEX IF NOT EXISTS idx_bots_token ON bots(bot_token);
		`,
	},
	{
		Name: "003_create_migrations_tracking",
		SQL: `
			CREATE TABLE IF NOT EXISTS schema_migrations (
				name       VARCHAR(255) PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`,
	},
	{
		Name: "004_create_projects",
		SQL: `
			CREATE TABLE IF NOT EXISTS projects (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				name          VARCHAR(255) NOT NULL,
				description   TEXT         DEFAULT '',
				status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
				created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
				updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
				CONSTRAINT uq_projects_user_id UNIQUE (user_id)
			);
			CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
		`,
	},
	{
		Name: "005_add_auth_fields",
		SQL: `
			ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20) NOT NULL DEFAULT 'email';
			ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
			ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
			ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6);
			ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
			ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
			CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
		`,
	},
	{
		Name: "006_enable_pgvector",
		SQL: `
			CREATE EXTENSION IF NOT EXISTS vector;
		`,
	},
	{
		Name: "007_add_project_bot_fields",
		SQL: `
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_url TEXT DEFAULT '';
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS gemini_api_key_encrypted TEXT DEFAULT '';
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS bot_name VARCHAR(255) DEFAULT '';
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS setup_step INT NOT NULL DEFAULT 0;
		`,
	},
	{
		Name: "008_create_documents",
		SQL: `
			CREATE TABLE IF NOT EXISTS documents (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
				source_url    TEXT         NOT NULL DEFAULT '',
				source_type   VARCHAR(20)  NOT NULL DEFAULT 'web',
				title         TEXT         DEFAULT '',
				raw_content   TEXT         DEFAULT '',
				content_hash  VARCHAR(64)  DEFAULT '',
				status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
				created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
		`,
	},
	{
		Name: "009_create_chunks",
		SQL: `
			CREATE TABLE IF NOT EXISTS chunks (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				document_id   UUID         NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
				project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
				chunk_index   INT          NOT NULL DEFAULT 0,
				content       TEXT         NOT NULL,
				embedding     vector(768),
				created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
			CREATE INDEX IF NOT EXISTS idx_chunks_project_id ON chunks(project_id);
		`,
	},
	{
		Name: "010_create_crawl_jobs",
		SQL: `
			CREATE TABLE IF NOT EXISTS crawl_jobs (
				id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
				status         TEXT DEFAULT 'queued',
				total_urls     INT DEFAULT 0,
				crawled_urls   INT DEFAULT 0,
				skipped_urls   INT DEFAULT 0,
				chunks_created INT DEFAULT 0,
				error_message  TEXT,
				started_at     TIMESTAMPTZ DEFAULT NOW(),
				finished_at    TIMESTAMPTZ
			);
			CREATE INDEX IF NOT EXISTS idx_crawl_jobs_project_id ON crawl_jobs(project_id);
		`,
	},
	{
		Name: "011_create_embed_jobs",
		SQL: `
			CREATE TABLE IF NOT EXISTS embed_jobs (
				id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
				status        TEXT DEFAULT 'queued',
				total_chunks  INT DEFAULT 0,
				embedded      INT DEFAULT 0,
				failed        INT DEFAULT 0,
				error_message TEXT,
				started_at    TIMESTAMPTZ DEFAULT NOW(),
				finished_at   TIMESTAMPTZ
			);
			CREATE INDEX IF NOT EXISTS idx_embed_jobs_project_id ON embed_jobs(project_id);
		`,
	},
	{
		Name: "013_add_crawl_job_logs",
		SQL: `
			ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT '';
			ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS recent_logs JSONB DEFAULT '[]';
		`,
	},
	{
		Name: "012_create_conversations",
		SQL: `
			CREATE TABLE IF NOT EXISTS conversations (
				id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
				session_id   TEXT NOT NULL,
				user_message TEXT NOT NULL,
				bot_answer   TEXT NOT NULL,
				confidence   FLOAT,
				fallback     BOOLEAN DEFAULT false,
				created_at   TIMESTAMPTZ DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
			CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
		`,
	},
	{
		Name: "014_add_llm_model_fields",
		SQL: `
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS llm_model VARCHAR(100) DEFAULT 'gemini-2.5-flash';
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS llm_rpm INT DEFAULT 5;
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS llm_tpm INT DEFAULT 250000;
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS llm_rpd INT DEFAULT 20;
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS max_input_tokens INT DEFAULT 50000;
		`,
	},
	{
		Name: "015_add_website_urls_array",
		SQL: `
			ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_urls TEXT[] DEFAULT '{}';
			UPDATE projects SET website_urls = ARRAY[website_url] WHERE website_url IS NOT NULL AND website_url != '' AND (website_urls IS NULL OR website_urls = '{}');
		`,
	},
	{
		Name: "016_add_chunk_metadata_columns",
		SQL: `
			ALTER TABLE chunks ADD COLUMN IF NOT EXISTS page_title TEXT DEFAULT '';
			ALTER TABLE chunks ADD COLUMN IF NOT EXISTS section_heading TEXT DEFAULT '';
			ALTER TABLE chunks ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'text';
			ALTER TABLE chunks ADD COLUMN IF NOT EXISTS word_count INT DEFAULT 0;
		`,
	},
	{
		Name: "017_add_embed_job_mode",
		SQL: `
			ALTER TABLE embed_jobs ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'auto';
		`,
	},
}

// RunMigrations applies all pending migrations.
func RunMigrations(pool *pgxpool.Pool) error {
	ctx := context.Background()

	// Ensure migrations tracking table exists first
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	if err != nil {
		return fmt.Errorf("failed to create schema_migrations table: %w", err)
	}

	for _, m := range migrations {
		// Check if already applied
		var exists bool
		err := pool.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)", m.Name,
		).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration %s: %w", m.Name, err)
		}
		if exists {
			continue
		}

		// Apply migration
		log.Printf("[migration] applying: %s", m.Name)
		_, err = pool.Exec(ctx, m.SQL)
		if err != nil {
			return fmt.Errorf("failed to run migration %s: %w", m.Name, err)
		}

		// Record it
		_, err = pool.Exec(ctx,
			"INSERT INTO schema_migrations (name) VALUES ($1)", m.Name,
		)
		if err != nil {
			return fmt.Errorf("failed to record migration %s: %w", m.Name, err)
		}

		log.Printf("[migration] applied: %s", m.Name)
	}

	return nil
}
