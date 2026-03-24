package main

import (
	"context"
	"log"
	"net/http"
	"runtime"
	"runtime/debug"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/config"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/metrics"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/server"
)

const (
	memoryLimitMB  = 500
	memoryLimitB   = memoryLimitMB * 1024 * 1024
	idleTrimAtMB   = 380 // keep headroom under hard limit
	idleTrimTicker = 20 * time.Second
)

func main() {
	configureRuntimeMemory()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to NeonDB (PostgreSQL)
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Connected to NeonDB successfully")

	// Run migrations
	if err := database.RunMigrations(db.Pool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations complete")

	// Clean up stale jobs from previous server instances
	cleanupStaleJobs(db)

	// Build router
	router := server.NewRouter(db)

	// Background memory manager for idle cleanup.
	go startMemoryManager(db)

	// Start server
	addr := ":" + cfg.Port
	log.Printf("ChatCraft API server starting on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func configureRuntimeMemory() {
	prevLimit := debug.SetMemoryLimit(memoryLimitB)
	prevGC := debug.SetGCPercent(80)
	log.Printf("[memory] Runtime memory limit set to %dMB (previous %.2fMB), GOGC=%d->80",
		memoryLimitMB,
		float64(prevLimit)/(1024.0*1024.0),
		prevGC,
	)
}

func startMemoryManager(db *database.DB) {
	ticker := time.NewTicker(idleTrimTicker)
	defer ticker.Stop()

	for range ticker.C {
		if metrics.InFlight() > 0 {
			continue
		}

		active, err := hasActiveBackgroundJobs(db)
		if err != nil {
			log.Printf("[memory] skip cleanup; active-job check failed: %v", err)
			continue
		}
		if active {
			continue
		}

		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		allocMB := float64(ms.Alloc) / (1024.0 * 1024.0)
		if allocMB < idleTrimAtMB {
			continue
		}

		runtime.GC()
		debug.FreeOSMemory()
		log.Printf("[memory] idle trim executed at alloc=%.2fMB", allocMB)
	}
}

func hasActiveBackgroundJobs(db *database.DB) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var activeCount int
	err := db.Pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM crawl_jobs WHERE status IN ('queued','running')) +
		  (SELECT COUNT(*) FROM embed_jobs WHERE status IN ('queued','running'))
	`).Scan(&activeCount)
	if err != nil {
		return false, err
	}

	return activeCount > 0, nil
}

// cleanupStaleJobs marks any "running" or "queued" crawl/embed jobs as "failed"
// since they were orphaned when the previous server instance shut down.
func cleanupStaleJobs(db *database.DB) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()

	tag1, err := db.Pool.Exec(ctx,
		`UPDATE crawl_jobs SET status = 'failed', error_message = 'Server restarted — job interrupted', 
		 finished_at = $1, current_phase = 'failed' 
		 WHERE status IN ('queued', 'running')`, now,
	)
	if err != nil {
		log.Printf("[startup] Failed to clean up stale crawl jobs: %v", err)
	} else if tag1.RowsAffected() > 0 {
		log.Printf("[startup] Cleaned up %d stale crawl job(s)", tag1.RowsAffected())
	}

	tag2, err := db.Pool.Exec(ctx,
		`UPDATE embed_jobs SET status = 'failed', error_message = 'Server restarted — job interrupted',
		 finished_at = $1
		 WHERE status IN ('queued', 'running')`, now,
	)
	if err != nil {
		log.Printf("[startup] Failed to clean up stale embed jobs: %v", err)
	} else if tag2.RowsAffected() > 0 {
		log.Printf("[startup] Cleaned up %d stale embed job(s)", tag2.RowsAffected())
	}
}
