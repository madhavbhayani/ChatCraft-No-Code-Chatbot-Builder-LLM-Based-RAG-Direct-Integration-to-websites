package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

const (
	defaultMinChunkWords    = 50
	defaultMinPageWords     = 100
	defaultSimilarityThresh = 0.60
	defaultMaxContextChunks = 12
)

// RAGConfig centralizes retrieval/chunking thresholds to avoid scattered magic numbers.
type RAGConfig struct {
	MinChunkWords    int
	MinPageWords     int
	SimilarityThresh float64
	MaxContextChunks int
}

// Config holds all application configuration.
type Config struct {
	Port                 string
	DatabaseURL          string
	ImagekitPrivateKey   string
	ImagekitPublicKey    string
	ImagekitUploadFolder string
	RAG                  RAGConfig
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func envFloat(key string, def float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f <= 0 {
		return def
	}
	return f
}

// GetRAGConfig returns RAG-related thresholds from environment with sane defaults.
func GetRAGConfig() RAGConfig {
	return RAGConfig{
		MinChunkWords:    envInt("RAG_MIN_CHUNK_WORDS", defaultMinChunkWords),
		MinPageWords:     envInt("RAG_MIN_PAGE_WORDS", defaultMinPageWords),
		SimilarityThresh: envFloat("RAG_SIMILARITY_THRESHOLD", defaultSimilarityThresh),
		MaxContextChunks: envInt("RAG_MAX_CONTEXT_CHUNKS", defaultMaxContextChunks),
	}
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
		Port:                 port,
		DatabaseURL:          dbURL,
		ImagekitPrivateKey:   os.Getenv("IMAGEKIT_PRIVATE_KEY"),
		ImagekitPublicKey:    os.Getenv("IMAGEKIT_PUBLIC_KEY"),
		ImagekitUploadFolder: os.Getenv("IMAGEKIT_UPLOAD_FOLDER"),
		RAG:                  GetRAGConfig(),
	}, nil
}
