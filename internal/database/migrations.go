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
