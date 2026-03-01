package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all application configuration.
type Config struct {
	Port        string
	DatabaseURL string
}

// Load reads environment variables and returns a Config.
// It loads from .env if present (for local development).
func Load() (*Config, error) {
	// Best-effort load of .env — ignore error if file missing
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required but not set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
	}, nil
}
