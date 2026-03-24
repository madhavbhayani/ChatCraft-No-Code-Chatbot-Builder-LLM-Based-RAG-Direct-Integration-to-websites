package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/service"

	_ "image/jpeg"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
	_ "golang.org/x/image/webp"
)

// pauseRequests tracks embed jobs that have been requested to pause.
var pauseRequests sync.Map // jobID → true

// BotBuilderHandler holds dependencies for bot builder endpoints.
type BotBuilderHandler struct {
	DB *database.DB
}

// NewBotBuilderHandler creates a BotBuilderHandler.
func NewBotBuilderHandler(db *database.DB) *BotBuilderHandler {
	return &BotBuilderHandler{DB: db}
}

// ---------- Step 1: Crawl Website ----------

// DiscoverSubdomainsRequest is the JSON body for subdomain discovery.
type DiscoverSubdomainsRequest struct {
	Domain string `json:"domain"`
}

// DiscoverSubdomains discovers subdomains for a domain via crt.sh and DNS validation.
func (h *BotBuilderHandler) DiscoverSubdomains(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify project belongs to user
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req DiscoverSubdomainsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Domain = strings.TrimSpace(req.Domain)
	if req.Domain == "" {
		writeError(w, http.StatusBadRequest, "Domain is required")
		return
	}

	result, err := service.DiscoverSubdomains(req.Domain)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Subdomain discovery failed: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// CrawlRequest is the JSON body for POST /api/v1/console/crawl/{project_id}
type CrawlRequest struct {
	URL  string   `json:"url"`
	URLs []string `json:"urls"`
}

// CrawlWebsite starts an async crawl job and returns 202 immediately.
func (h *BotBuilderHandler) CrawlWebsite(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify project belongs to user
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req CrawlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Build the list of URLs to crawl (support both single url and urls array)
	var crawlURLs []string
	if len(req.URLs) > 0 {
		for _, u := range req.URLs {
			u = strings.TrimSpace(u)
			if u == "" {
				continue
			}
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				u = "https://" + u
			}
			crawlURLs = append(crawlURLs, u)
		}
	} else if strings.TrimSpace(req.URL) != "" {
		u := strings.TrimSpace(req.URL)
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			u = "https://" + u
		}
		crawlURLs = []string{u}
	}

	if len(crawlURLs) == 0 {
		writeError(w, http.StatusBadRequest, "At least one URL is required")
		return
	}

	// Check if there's already an active crawl job for this project
	var activeJobID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM crawl_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&activeJobID)
	if err == nil && activeJobID != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Crawl job already running",
			"job_id":  activeJobID,
		})
		return
	}

	// Update project website_urls (array) and legacy website_url (first URL)
	log.Printf("[DB] UPDATE projects SET website_urls = %v WHERE id = %s", crawlURLs, projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET website_urls = $1, website_url = $2, updated_at = NOW() WHERE id = $3",
		crawlURLs, crawlURLs[0], projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR update project URLs: %v", err)
	} else {
		log.Printf("[DB] OK updated project website_urls")
	}

	// Insert crawl job with status = 'queued'
	jobID := uuid.New().String()
	log.Printf("[DB] INSERT INTO crawl_jobs (id=%s, project_id=%s, status='queued')", jobID, projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO crawl_jobs (id, project_id, status, started_at)
		 VALUES ($1, $2, 'queued', NOW())`,
		jobID, projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR insert crawl_jobs: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create crawl job")
		return
	}
	log.Printf("[DB] OK inserted crawl_jobs id=%s", jobID)

	// Launch background goroutine
	go h.runCrawlJob(jobID, projectID, crawlURLs)

	// Return 202 Accepted with job_id
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Crawl job started",
		"job_id":  jobID,
	})
}

// ---------- Crawl Progress Tracker ----------

// crawlProgress tracks crawl job state and writes directly to DB.
type crawlProgress struct {
	Phase         string
	CrawledURLs   int
	SkippedURLs   int
	TotalURLs     int
	ChunksCreated int
	Logs          []map[string]string
	lastFlushAt   time.Time
}

// newCrawlProgress creates a new progress tracker.
func newCrawlProgress() *crawlProgress {
	return &crawlProgress{
		Logs: make([]map[string]string, 0, 20),
	}
}

// addLog appends a log entry (keeps last 20).
func (p *crawlProgress) addLog(msg string) {
	entry := map[string]string{
		"ts":  time.Now().UTC().Format(time.RFC3339),
		"msg": msg,
	}
	p.Logs = append(p.Logs, entry)
	if len(p.Logs) > 20 {
		p.Logs = p.Logs[len(p.Logs)-20:]
	}
}

// writeToDB writes the current progress to the database.
// If force=true, always writes. If force=false, throttles to once every 3 seconds.
func (h *BotBuilderHandler) writeCrawlProgress(jobID string, p *crawlProgress, force bool) {
	if !force && time.Since(p.lastFlushAt) < 3*time.Second {
		return // throttle — skip this write
	}

	logsJSON, err := json.Marshal(p.Logs)
	if err != nil {
		log.Printf("[crawl-progress] ERROR marshaling logs: %v", err)
		logsJSON = []byte("[]")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Printf("[DB] UPDATE crawl_jobs SET current_phase='%s', crawled=%d, skipped=%d, total=%d, chunks=%d, logsLen=%d WHERE id=%s",
		p.Phase, p.CrawledURLs, p.SkippedURLs, p.TotalURLs, p.ChunksCreated, len(p.Logs), jobID)
	_, err = h.DB.Pool.Exec(ctx,
		`UPDATE crawl_jobs SET
			current_phase  = $1,
			crawled_urls   = $2,
			skipped_urls   = $3,
			total_urls     = $4,
			chunks_created = $5,
			recent_logs    = $6::jsonb
		 WHERE id = $7`,
		p.Phase, p.CrawledURLs, p.SkippedURLs, p.TotalURLs, p.ChunksCreated,
		string(logsJSON), jobID,
	)
	if err != nil {
		log.Printf("[DB] ERROR writeCrawlProgress for job %s: %v", jobID, err)
		log.Printf("[DB]   logsJSON sample: %.200s", string(logsJSON))
	} else {
		log.Printf("[DB] OK writeCrawlProgress job=%s phase=%s", jobID[:8], p.Phase)
	}
	p.lastFlushAt = time.Now()
}

// runCrawlJob performs crawling, incremental hash comparison, chunking in background.
func (h *BotBuilderHandler) runCrawlJob(jobID, projectID string, crawlURLs []string) {
	ctx := context.Background()
	log.Printf("[crawl-job] STARTING job=%s project=%s urls=%v", jobID, projectID, crawlURLs)

	// Progress tracker — writes directly to DB at key moments
	prog := newCrawlProgress()

	// 1. Mark job as running (separate from log columns for reliability)
	log.Printf("[DB] UPDATE crawl_jobs SET status='running' WHERE id = %s", jobID)
	_, err := h.DB.Pool.Exec(ctx,
		"UPDATE crawl_jobs SET status = 'running' WHERE id = $1", jobID,
	)
	if err != nil {
		log.Printf("[DB] ERROR marking job running: %v", err)
	} else {
		log.Printf("[DB] OK crawl_jobs status='running'")
	}

	// 2. Write initial progress with phase + logs
	prog.Phase = "crawling"
	prog.addLog(fmt.Sprintf("Starting crawl for %d URL(s)", len(crawlURLs)))
	h.writeCrawlProgress(jobID, prog, true) // force=true

	// --- CRAWL ALL URLs ---
	var allPages []service.PageContent
	var totalThinSkipped, totalErrors int

	for i, crawlURL := range crawlURLs {
		prog.addLog(fmt.Sprintf("Crawling URL %d/%d: %s", i+1, len(crawlURLs), crawlURL))
		h.writeCrawlProgress(jobID, prog, true)

		log.Printf("[crawl-job] SmartCrawl starting for %s", crawlURL)
		result, err := service.SmartCrawl(crawlURL, func(pagesFound, thinSkipped, errors int, currentURL string) {
			prog.TotalURLs = len(allPages) + pagesFound + thinSkipped + errors + totalThinSkipped + totalErrors
			prog.CrawledURLs = len(allPages) + pagesFound
			prog.SkippedURLs = totalThinSkipped + thinSkipped
			prog.addLog(fmt.Sprintf("Found page (%d total, %d skipped): %s", len(allPages)+pagesFound, totalThinSkipped+thinSkipped, currentURL))
			h.writeCrawlProgress(jobID, prog, false)
		})
		if err != nil {
			log.Printf("[crawl-job] SmartCrawl FAILED for %s: %v", crawlURL, err)
			prog.addLog(fmt.Sprintf("⚠ Failed to crawl %s: %s (continuing with others)", crawlURL, err.Error()))
			h.writeCrawlProgress(jobID, prog, true)
			continue
		}

		log.Printf("[crawl-job] SmartCrawl DONE for %s: %d pages, %d thin skipped",
			crawlURL, len(result.Pages), result.Report.ThinContentSkipped)
		allPages = append(allPages, result.Pages...)
		totalThinSkipped += result.Report.ThinContentSkipped
		totalErrors += result.Report.ErrorCount
		prog.addLog(fmt.Sprintf("✓ Crawled %s: %d pages extracted", crawlURL, len(result.Pages)))
		h.writeCrawlProgress(jobID, prog, true)
	}

	if len(allPages) == 0 {
		prog.Phase = "failed"
		prog.addLog("No pages were crawled from any URL")
		h.writeCrawlProgress(jobID, prog, true)
		now := time.Now()
		h.DB.Pool.Exec(ctx,
			"UPDATE crawl_jobs SET status = 'failed', error_message = $1, finished_at = $2, current_phase = 'failed' WHERE id = $3",
			"No pages crawled", now, jobID,
		)
		return
	}

	totalDiscovered := len(allPages) + totalThinSkipped + totalErrors
	prog.TotalURLs = totalDiscovered
	prog.addLog(fmt.Sprintf("Crawl complete: %d pages extracted, %d thin-content skipped",
		len(allPages), totalThinSkipped))
	h.writeCrawlProgress(jobID, prog, true) // force

	// --- INCREMENTAL HASH COMPARISON ---
	prog.Phase = "comparing"
	prog.addLog("Comparing with existing documents (incremental update)...")
	h.writeCrawlProgress(jobID, prog, true) // force

	existingHashes := make(map[string]string)
	existingIDs := make(map[string]string)
	rows, err := h.DB.Pool.Query(ctx,
		"SELECT id, source_url, content_hash FROM documents WHERE project_id = $1 AND source_type = 'web'",
		projectID,
	)
	if err == nil {
		for rows.Next() {
			var id, srcURL, hash string
			if rows.Scan(&id, &srcURL, &hash) == nil {
				normalizedSrcURL := normalizeCrawlURL(srcURL)
				existingHashes[normalizedSrcURL] = hash
				existingIDs[normalizedSrcURL] = id
			}
		}
		rows.Close()
	}

	// --- PROCESS PAGES ---
	newURLs := make(map[string]bool)
	crawledCount := 0
	skippedCount := 0

	prog.Phase = "processing"
	for i, page := range allPages {
		normalizedPageURL := normalizeCrawlURL(page.URL)
		newURLs[normalizedPageURL] = true
		rawContent := service.ComposeRawContent(page)
		newHash := fmt.Sprintf("%x", sha256.Sum256([]byte(rawContent)))
		wordCount := len(strings.Fields(rawContent))

		if oldHash, exists := existingHashes[normalizedPageURL]; exists && oldHash == newHash {
			skippedCount++
			prog.addLog(fmt.Sprintf("⏭ Unchanged: %s", page.URL))
			prog.SkippedURLs = skippedCount
			prog.CrawledURLs = crawledCount
			// Throttled write (every 3s)
			h.writeCrawlProgress(jobID, prog, false)
			continue
		}

		if oldID, exists := existingIDs[normalizedPageURL]; exists {
			h.DB.Pool.Exec(ctx, "DELETE FROM documents WHERE id = $1", oldID)
			prog.addLog(fmt.Sprintf("🔄 Updated: %s (%d words)", page.URL, wordCount))
		} else {
			prog.addLog(fmt.Sprintf("✓ Extracted %d words from: %s", wordCount, page.URL))
		}

		docID := uuid.New().String()
		log.Printf("[DB] INSERT INTO documents (id=%s, url=%s, words=%d)", docID[:8], page.URL, wordCount)
		_, err := h.DB.Pool.Exec(ctx,
			`INSERT INTO documents (id, project_id, source_url, source_type, title, raw_content, content_hash, status, created_at)
			 VALUES ($1, $2, $3, 'web', $4, $5, $6, 'pending', NOW())`,
			docID, projectID, page.URL, page.Title, rawContent, newHash,
		)
		if err != nil {
			log.Printf("[DB] ERROR insert doc: %v", err)
			continue
		}
		log.Printf("[DB] OK inserted document id=%s", docID[:8])
		crawledCount++
		prog.CrawledURLs = crawledCount
		prog.SkippedURLs = skippedCount

		// Force write every 5 pages; throttled otherwise
		forceWrite := (i+1)%5 == 0 || i == len(allPages)-1
		h.writeCrawlProgress(jobID, prog, forceWrite)
	}

	// Delete documents whose URLs no longer appear in the new crawl
	for srcURL, oldID := range existingIDs {
		if !newURLs[srcURL] {
			h.DB.Pool.Exec(ctx, "DELETE FROM documents WHERE id = $1", oldID)
			prog.addLog(fmt.Sprintf("🗑 Removed (no longer on site): %s", srcURL))
		}
	}

	// --- AUTO-CHUNK all pending documents ---
	prog.Phase = "chunking"
	prog.addLog("Auto-chunking crawled pages into ~400-word chunks...")
	h.writeCrawlProgress(jobID, prog, true)

	chunkRows, chunkErr := h.DB.Pool.Query(ctx,
		"SELECT id, title, raw_content FROM documents WHERE project_id = $1 AND status = 'pending'", projectID,
	)
	totalChunksCreated := 0
	if chunkErr != nil {
		log.Printf("[crawl-job] ERROR fetching docs for chunking: %v", chunkErr)
		prog.addLog("⚠ Failed to fetch documents for chunking")
	} else {
		for chunkRows.Next() {
			var docID, title, content string
			if chunkRows.Scan(&docID, &title, &content) != nil {
				continue
			}
			// Delete existing chunks for this document (re-crawl scenario)
			_, _ = h.DB.Pool.Exec(ctx, "DELETE FROM chunks WHERE document_id = $1", docID)

			chunks := service.SmartChunkText(title, content, 300, 40)
			batch := &pgx.Batch{}
			for _, chunk := range chunks {
				chunkID := uuid.New().String()
				batch.Queue(
					`INSERT INTO chunks (id, document_id, project_id, chunk_index, content, page_title, section_heading, chunk_type, word_count, created_at)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
					chunkID, docID, projectID, chunk.Index, chunk.Content, chunk.PageTitle, chunk.SectionHeading, chunk.Type, chunk.WordCount,
				)
				if batch.Len() >= 50 {
					br := h.DB.Pool.SendBatch(ctx, batch)
					for i := 0; i < batch.Len(); i++ {
						if _, err := br.Exec(); err != nil {
							log.Printf("[crawl-chunk] insert error: %v", err)
						} else {
							totalChunksCreated++
						}
					}
					br.Close()
					batch = &pgx.Batch{}
				}
			}
			if batch.Len() > 0 {
				br := h.DB.Pool.SendBatch(ctx, batch)
				for i := 0; i < batch.Len(); i++ {
					if _, err := br.Exec(); err != nil {
						log.Printf("[crawl-chunk] insert error: %v", err)
					} else {
						totalChunksCreated++
					}
				}
				br.Close()
			}
			_, _ = h.DB.Pool.Exec(ctx, "UPDATE documents SET status = 'chunked' WHERE id = $1", docID)
		}
		chunkRows.Close()
	}
	log.Printf("[crawl-job] Auto-chunked: %d chunks created", totalChunksCreated)
	prog.addLog(fmt.Sprintf("✓ Created %d chunks from crawled pages", totalChunksCreated))
	h.writeCrawlProgress(jobID, prog, true)

	// Update setup_step to 2 (crawl + chunk done — user proceeds to embed)
	_, err = h.DB.Pool.Exec(ctx,
		"UPDATE projects SET setup_step = GREATEST(setup_step, 2), updated_at = NOW() WHERE id = $1",
		projectID,
	)
	if err != nil {
		log.Printf("[crawl-job] ERROR updating setup_step: %v", err)
	} else {
		log.Printf("[DB] UPDATE projects SET setup_step = GREATEST(setup_step, 2) WHERE id = %s", projectID)
	}

	// --- FINAL ---
	prog.Phase = "done"
	prog.addLog(fmt.Sprintf("All done! %d new/updated, %d unchanged, %d chunks created. Ready for embedding.",
		crawledCount, skippedCount, totalChunksCreated))
	h.writeCrawlProgress(jobID, prog, true) // force final write

	now := time.Now()
	_, err = h.DB.Pool.Exec(ctx,
		`UPDATE crawl_jobs SET status = 'done', crawled_urls = $1, skipped_urls = $2,
		 total_urls = $3, chunks_created = $4, finished_at = $5, current_phase = 'done'
		 WHERE id = $6`,
		crawledCount, skippedCount, totalDiscovered, totalChunksCreated, now, jobID,
	)
	if err != nil {
		log.Printf("[crawl-job] ERROR marking job done: %v", err)
	} else {
		log.Printf("[DB] UPDATE crawl_jobs SET status='done' WHERE id = %s", jobID)
	}

	log.Printf("[crawl-job] %s COMPLETE: %d crawled, %d skipped, %d chunks",
		jobID, crawledCount, skippedCount, totalChunksCreated)
}

// GetCrawlJobStatus returns the current status of a crawl job.
func (h *BotBuilderHandler) GetCrawlJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("job_id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, "Job ID is required")
		return
	}

	var status, errorMessage, currentPhase string
	var totalURLs, crawledURLs, skippedURLs, chunksCreated int
	var startedAt time.Time
	var finishedAt *time.Time
	var recentLogs []byte

	log.Printf("[DB] SELECT FROM crawl_jobs WHERE id = %s", jobID)
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT status, total_urls, crawled_urls, skipped_urls, chunks_created,
		        COALESCE(error_message, ''), COALESCE(current_phase, ''), started_at, finished_at,
		        COALESCE(recent_logs::text, '[]')
		 FROM crawl_jobs WHERE id = $1`, jobID,
	).Scan(&status, &totalURLs, &crawledURLs, &skippedURLs, &chunksCreated,
		&errorMessage, &currentPhase, &startedAt, &finishedAt, &recentLogs)
	if err != nil {
		log.Printf("[DB] ERROR querying crawl_jobs id=%s: %v", jobID, err)
		writeError(w, http.StatusNotFound, "Crawl job not found")
		return
	}
	log.Printf("[DB] OK crawl_jobs id=%s status=%s phase=%s crawled=%d", jobID[:8], status, currentPhase, crawledURLs)

	// Parse recent_logs as JSON array, default to empty array on error
	var parsedLogs json.RawMessage
	if len(recentLogs) > 0 && json.Valid(recentLogs) {
		parsedLogs = json.RawMessage(recentLogs)
	} else {
		parsedLogs = json.RawMessage("[]")
	}

	resp := map[string]interface{}{
		"id":             jobID,
		"status":         status,
		"total_urls":     totalURLs,
		"crawled_urls":   crawledURLs,
		"skipped_urls":   skippedURLs,
		"chunks_created": chunksCreated,
		"current_phase":  currentPhase,
		"recent_logs":    parsedLogs,
		"started_at":     startedAt,
	}
	if errorMessage != "" {
		resp["error_message"] = errorMessage
	}
	if finishedAt != nil {
		resp["finished_at"] = *finishedAt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ---------- Step 2: Chunk Documents + File Upload ----------

// ChunkDocuments chunks all pending documents for a project.
func (h *BotBuilderHandler) ChunkDocuments(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Fetch all pending documents
	rows, err := h.DB.Pool.Query(r.Context(),
		"SELECT id, title, raw_content FROM documents WHERE project_id = $1 AND status = 'pending'", projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch documents")
		return
	}
	defer rows.Close()

	totalChunks := 0
	for rows.Next() {
		var docID, title, content string
		if err := rows.Scan(&docID, &title, &content); err != nil {
			continue
		}

		// Delete existing chunks for this document (re-chunk scenario)
		log.Printf("[DB] DELETE FROM chunks WHERE document_id = %s", docID[:8])
		_, _ = h.DB.Pool.Exec(r.Context(),
			"DELETE FROM chunks WHERE document_id = $1", docID,
		)

		// Smart chunk: FAQ-aware, heading-aware, with title prefix
		chunks := service.SmartChunkText(title, content, 300, 40)

		batch := &pgx.Batch{}
		for _, chunk := range chunks {
			chunkID := uuid.New().String()
			batch.Queue(
				`INSERT INTO chunks (id, document_id, project_id, chunk_index, content, page_title, section_heading, chunk_type, word_count, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
				chunkID, docID, projectID, chunk.Index, chunk.Content, chunk.PageTitle, chunk.SectionHeading, chunk.Type, chunk.WordCount,
			)
			if batch.Len() >= 50 {
				br := h.DB.Pool.SendBatch(r.Context(), batch)
				for i := 0; i < batch.Len(); i++ {
					if _, err := br.Exec(); err != nil {
						log.Printf("[chunk] insert error: %v", err)
					} else {
						totalChunks++
					}
				}
				br.Close()
				batch = &pgx.Batch{}
			}
		}
		if batch.Len() > 0 {
			br := h.DB.Pool.SendBatch(r.Context(), batch)
			for i := 0; i < batch.Len(); i++ {
				if _, err := br.Exec(); err != nil {
					log.Printf("[chunk] insert error: %v", err)
				} else {
					totalChunks++
				}
			}
			br.Close()
		}

		// Mark document as chunked
		log.Printf("[DB] UPDATE documents SET status='chunked' WHERE id = %s", docID[:8])
		_, _ = h.DB.Pool.Exec(r.Context(),
			"UPDATE documents SET status = 'chunked' WHERE id = $1", docID,
		)
	}

	log.Printf("[DB] OK ChunkDocuments complete: %d chunks created", totalChunks)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      fmt.Sprintf("Created %d chunks", totalChunks),
		"total_chunks": totalChunks,
	})
}

// UploadFile handles file upload (txt, md, csv, html) up to 3MB.
// POST /api/v1/console/upload/{project_id}
func (h *BotBuilderHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Parse multipart form (max 3MB)
	if err := r.ParseMultipartForm(3 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large (max 3MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	// Check file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{".txt": true, ".md": true, ".csv": true, ".html": true}
	if !allowedExts[ext] {
		writeError(w, http.StatusBadRequest, "Only .txt, .md, .csv, .html files are allowed")
		return
	}

	// Check size
	if header.Size > 3*1024*1024 {
		writeError(w, http.StatusBadRequest, "File too large (max 3MB)")
		return
	}

	// Read content
	content, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	textContent := string(content)

	// If HTML, strip tags (basic extraction)
	if ext == ".html" {
		textContent = stripHTMLTags(textContent)
	}

	docID := uuid.New().String()
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(textContent)))

	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO documents (id, project_id, source_url, source_type, title, raw_content, content_hash, status, created_at)
		 VALUES ($1, $2, $3, 'upload', $4, $5, $6, 'pending', NOW())`,
		docID, projectID, header.Filename, header.Filename, textContent, hash,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save document")
		return
	}

	// Auto-chunk the uploaded document so it's ready for embedding
	chunks := service.SmartChunkText(header.Filename, textContent, 300, 40)
	totalChunks := 0
	for _, chunk := range chunks {
		chunkID := uuid.New().String()
		_, err := h.DB.Pool.Exec(r.Context(),
			`INSERT INTO chunks (id, document_id, project_id, chunk_index, content, page_title, section_heading, chunk_type, word_count, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
			chunkID, docID, projectID, chunk.Index, chunk.Content, chunk.PageTitle, chunk.SectionHeading, chunk.Type, chunk.WordCount,
		)
		if err != nil {
			log.Printf("[upload-chunk] insert error: %v", err)
			continue
		}
		totalChunks++
	}

	// Mark document as chunked
	_, _ = h.DB.Pool.Exec(r.Context(),
		"UPDATE documents SET status = 'chunked' WHERE id = $1", docID,
	)
	log.Printf("[upload] File %s: inserted doc %s with %d chunks", header.Filename, docID[:8], totalChunks)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "File uploaded and chunked successfully",
		"document_id":  docID,
		"filename":     header.Filename,
		"words":        len(strings.Fields(textContent)),
		"total_chunks": totalChunks,
	})
}

// ---------- Step 3: Save Gemini API Key ----------

// SaveAPIKeyRequest is the JSON body for POST /api/v1/console/api-key/{project_id}
type SaveAPIKeyRequest struct {
	APIKey string `json:"api_key"`
}

// SaveAPIKey validates and encrypts the Gemini API key, stores it in the project.
func (h *BotBuilderHandler) SaveAPIKey(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req SaveAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.APIKey = strings.TrimSpace(req.APIKey)
	if req.APIKey == "" {
		writeError(w, http.StatusBadRequest, "API key is required")
		return
	}

	// Validate the key by making a test embedding call
	if err := service.ValidateGeminiKey(r.Context(), req.APIKey); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid API key: %v", err))
		return
	}

	// Encrypt the key
	encrypted, err := service.EncryptString(req.APIKey)
	if err != nil {
		log.Printf("[api-key] encryption error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to encrypt API key")
		return
	}

	// Store encrypted key
	log.Printf("[DB] UPDATE projects SET gemini_api_key_encrypted, setup_step=GREATEST(setup_step,1) WHERE id = %s", projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET gemini_api_key_encrypted = $1, setup_step = GREATEST(setup_step, 1), updated_at = NOW() WHERE id = $2",
		encrypted, projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR saving API key: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to save API key")
		return
	}
	log.Printf("[DB] OK API key saved for project %s", projectID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "API key validated and saved successfully",
	})
}

// ---------- Step 4: Embed Chunks ----------

// Gemini free-tier embedding limits.
const (
	embedRPM = 100  // requests per minute
	embedRPD = 1000 // requests per day
)

// GetEmbedPlan returns an estimate of how many chunks can be embedded today and how long it will take.
func (h *BotBuilderHandler) GetEmbedPlan(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var pendingChunks int
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1 AND embedding IS NULL", projectID,
	).Scan(&pendingChunks)

	todayChunks := pendingChunks
	if todayChunks > embedRPD {
		todayChunks = embedRPD
	}
	tomorrowChunks := pendingChunks - todayChunks

	// One-by-one embedding with ~600ms spacing between requests.
	estimatedSeconds := float64(todayChunks) * 0.65
	estimatedMinutes := math.Ceil(estimatedSeconds / 60)
	totalDays := int(math.Ceil(float64(pendingChunks) / float64(embedRPD)))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"pending_chunks":         pendingChunks,
		"today_chunks":           todayChunks,
		"tomorrow_chunks":        tomorrowChunks,
		"estimated_time_minutes": int(estimatedMinutes),
		"total_days":             totalDays,
		"rpm_limit":              embedRPM,
		"rpd_limit":              embedRPD,
	})
}

// EmbedChunks starts an async embedding job and returns 202 immediately.
func (h *BotBuilderHandler) EmbedChunks(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Get decrypted API key
	var encryptedKey string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT gemini_api_key_encrypted FROM projects WHERE id = $1", projectID,
	).Scan(&encryptedKey)
	if err != nil || encryptedKey == "" {
		writeError(w, http.StatusBadRequest, "Gemini API key not configured. Complete Step 1 first.")
		return
	}

	apiKey, err := service.DecryptString(encryptedKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to decrypt API key")
		return
	}

	// Check if there's already an active embed job for this project
	var activeEmbedJobID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM embed_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&activeEmbedJobID)
	if err == nil && activeEmbedJobID != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Embed job already running",
			"job_id":  activeEmbedJobID,
		})
		return
	}

	// Count pending chunks
	var pendingCount int
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1 AND embedding IS NULL", projectID,
	).Scan(&pendingCount)
	if err != nil || pendingCount == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":  "No chunks to embed",
			"embedded": 0,
		})
		return
	}

	// Insert embed job
	jobID := uuid.New().String()
	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO embed_jobs (id, project_id, status, total_chunks, started_at)
		 VALUES ($1, $2, 'queued', $3, NOW())`,
		jobID, projectID, pendingCount,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create embed job")
		return
	}

	// Launch background goroutine
	go h.runEmbedJob(jobID, projectID, apiKey)

	// Return 202 Accepted
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Embedding job started",
		"job_id":  jobID,
		"total":   pendingCount,
	})
}

// ReEmbedChunks clears all embeddings and starts a fresh embedding job.
// This is useful when you want to re-embed all chunks (e.g., after changing API key or model).
func (h *BotBuilderHandler) ReEmbedChunks(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Get decrypted API key
	var encryptedKey string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT gemini_api_key_encrypted FROM projects WHERE id = $1", projectID,
	).Scan(&encryptedKey)
	if err != nil || encryptedKey == "" {
		writeError(w, http.StatusBadRequest, "Gemini API key not configured. Complete Step 1 first.")
		return
	}

	apiKey, err := service.DecryptString(encryptedKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to decrypt API key")
		return
	}

	// Clear all existing embeddings for this project
	log.Printf("[re-embed] Clearing embeddings for project %s", projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE chunks SET embedding = NULL WHERE project_id = $1", projectID,
	)
	if err != nil {
		log.Printf("[re-embed] ERROR clearing embeddings: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to clear embeddings")
		return
	}

	// Check if there's already an active embed job for this project
	var activeEmbedJobID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM embed_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&activeEmbedJobID)
	if err == nil && activeEmbedJobID != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Embed job already running",
			"job_id":  activeEmbedJobID,
		})
		return
	}

	// Count all chunks (they all need re-embedding now)
	var totalCount int
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1", projectID,
	).Scan(&totalCount)
	if err != nil || totalCount == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":  "No chunks to embed",
			"embedded": 0,
		})
		return
	}

	// Insert embed job
	jobID := uuid.New().String()
	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO embed_jobs (id, project_id, status, total_chunks, started_at)
		 VALUES ($1, $2, 'queued', $3, NOW())`,
		jobID, projectID, totalCount,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create embed job")
		return
	}

	log.Printf("[re-embed] Starting fresh embedding job for project %s: %d chunks", projectID, totalCount)

	// Launch background goroutine
	go h.runEmbedJob(jobID, projectID, apiKey)

	// Return 202 Accepted
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Re-embedding job started (all previous embeddings cleared)",
		"job_id":  jobID,
		"total":   totalCount,
	})
}

// PauseEmbedJob signals a running embed job to pause.
func (h *BotBuilderHandler) PauseEmbedJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("job_id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, "Job ID is required")
		return
	}

	// Verify the job exists and is running
	var status, projectID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT status, project_id FROM embed_jobs WHERE id = $1", jobID,
	).Scan(&status, &projectID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Embed job not found")
		return
	}

	// Verify ownership
	userID := r.Header.Get("X-User-ID")
	var ownerID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	if status != "queued" && status != "running" {
		writeError(w, http.StatusBadRequest, "Job is not active (status: "+status+")")
		return
	}

	// Signal the goroutine to pause
	pauseRequests.Store(jobID, true)
	log.Printf("[embed-job] Pause requested for job %s", jobID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Pause signal sent. Job will pause after current chunk.",
	})
}

// flushEmbedBatch sends all queued batch writes and resets the batch.
func (h *BotBuilderHandler) flushEmbedBatch(ctx context.Context, batch *pgx.Batch, jobID string, embedded, failed *int) *pgx.Batch {
	if batch.Len() == 0 {
		return batch
	}
	br := h.DB.Pool.SendBatch(ctx, batch)
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			log.Printf("[embed-job] batch update error: %v", err)
			*failed++
			*embedded--
		}
	}
	br.Close()
	// Update progress in DB
	h.DB.Pool.Exec(ctx,
		"UPDATE embed_jobs SET embedded = $1, failed = $2 WHERE id = $3",
		*embedded, *failed, jobID,
	)
	return &pgx.Batch{}
}

// runEmbedJob embeds pending chunks one-by-one.
// Rate limits: 600ms between calls (RPM=100), 60s wait on 429, pause on daily quota (RPD=1000).
// Progress is flushed every 10 seconds (or immediately on pause/quota/end).
func (h *BotBuilderHandler) runEmbedJob(jobID, projectID, apiKey string) {
	ctx := context.Background()

	// Mark job as running
	log.Printf("[embed-job] %s starting (one-by-one mode)", jobID)
	h.DB.Pool.Exec(ctx, "UPDATE embed_jobs SET status = 'running' WHERE id = $1", jobID)

	// Fetch all chunks without embeddings
	rows, err := h.DB.Pool.Query(ctx,
		"SELECT id, content FROM chunks WHERE project_id = $1 AND embedding IS NULL", projectID,
	)
	if err != nil {
		now := time.Now()
		h.DB.Pool.Exec(ctx,
			"UPDATE embed_jobs SET status = 'failed', error_message = $1, finished_at = $2 WHERE id = $3",
			err.Error(), now, jobID,
		)
		return
	}

	type chunkRow struct {
		ID      string
		Content string
	}
	var pendingChunks []chunkRow
	for rows.Next() {
		var c chunkRow
		if rows.Scan(&c.ID, &c.Content) == nil {
			pendingChunks = append(pendingChunks, c)
		}
	}
	rows.Close()

	embedded := 0
	failed := 0
	dailyRequests := 0
	embedBatch := &pgx.Batch{}
	lastFlush := time.Now()

	// Helper: flush + pause the job
	pauseJob := func(msg string) {
		embedBatch = h.flushEmbedBatch(ctx, embedBatch, jobID, &embedded, &failed)
		now := time.Now()
		h.DB.Pool.Exec(ctx,
			"UPDATE embed_jobs SET status = 'paused', error_message = $1, embedded = $2, failed = $3, finished_at = $4 WHERE id = $5",
			msg, embedded, failed, now, jobID,
		)
		pauseRequests.Delete(jobID)
		log.Printf("[embed-job] %s paused: %s", jobID, msg)
	}

	for i, chunk := range pendingChunks {
		// --- Check for user-requested pause ---
		if _, ok := pauseRequests.Load(jobID); ok {
			pauseJob(fmt.Sprintf("Paused by user after %d/%d chunks embedded.", embedded, len(pendingChunks)))
			return
		}

		// --- Check internal daily request counter ---
		if dailyRequests >= embedRPD {
			pauseJob(fmt.Sprintf("Daily limit (%d requests) reached after %d/%d chunks. Remaining chunks will embed when you resume.", embedRPD, embedded, len(pendingChunks)))
			return
		}

		// Rate-limit: 600ms between API calls (100 RPM free-tier safety).
		if i > 0 {
			time.Sleep(600 * time.Millisecond)
		}

		// Embed single chunk with retry on 429 (wait 60s per attempt).
		var embedding []float32
		var embedErr error
		maxRetries := 3
		for attempt := 0; attempt <= maxRetries; attempt++ {
			embedding, embedErr = service.EmbedChunkForStorage(ctx, apiKey, chunk.Content)
			dailyRequests++
			if embedErr == nil {
				break
			}

			errMsg := embedErr.Error()

			// RESOURCE_EXHAUSTED = daily quota hit → pause job with user-friendly message
			if strings.Contains(errMsg, "RESOURCE_EXHAUSTED") || strings.Contains(errMsg, "quota") {
				// Log full technical error to terminal for debugging
				log.Printf("[embed-job] ⚠️  QUOTA EXHAUSTED - Full error details:\n%v", embedErr)
				log.Printf("[embed-job] Daily quota reached at chunk %d/%d", i+1, len(pendingChunks))

				userMessage := fmt.Sprintf("Daily quota reached after %d/%d chunks. Remaining chunks will embed when you resume.", embedded, len(pendingChunks))
				pauseJob(userMessage)
				return
			}

			// 429 per-minute rate limit → wait 60 seconds and retry
			if attempt < maxRetries && (strings.Contains(errMsg, "429") || strings.Contains(strings.ToLower(errMsg), "rate")) {
				log.Printf("[embed-job] 429 for chunk %s (attempt %d/%d), waiting 60s", chunk.ID, attempt+1, maxRetries)
				time.Sleep(60 * time.Second)
				continue
			}

			// Other error — don't retry
			break
		}

		if embedErr != nil {
			// Log technical error to terminal, but don't expose to frontend
			log.Printf("[embed-job] ❌ Embedding error for chunk %s: %v", chunk.ID, embedErr)
			failed++
		} else {
			vec := pgvector.NewVector(embedding)
			embedBatch.Queue("UPDATE chunks SET embedding = $1 WHERE id = $2", vec, chunk.ID)
			embedded++
		}

		// Flush DB updates every 10 seconds or on last chunk.
		if time.Since(lastFlush) >= 10*time.Second || i == len(pendingChunks)-1 {
			embedBatch = h.flushEmbedBatch(ctx, embedBatch, jobID, &embedded, &failed)
			lastFlush = time.Now()
			log.Printf("[embed-job] progress: %d/%d embedded, %d failed", embedded, len(pendingChunks), failed)
		}
	}

	// Mark documents as embedded
	h.DB.Pool.Exec(ctx,
		`UPDATE documents SET status = 'embedded' 
		 WHERE project_id = $1 AND status = 'chunked'`, projectID,
	)

	// Update setup_step to 3 (complete)
	h.DB.Pool.Exec(ctx,
		"UPDATE projects SET setup_step = 3, status = 'active', updated_at = NOW() WHERE id = $1",
		projectID,
	)

	// Mark job as done
	now := time.Now()
	status := "done"
	errMsg := ""
	if failed > 0 && embedded == 0 {
		status = "failed"
		errMsg = fmt.Sprintf("All %d chunks failed to embed", failed)
	}
	h.DB.Pool.Exec(ctx,
		"UPDATE embed_jobs SET status = $1, error_message = $2, finished_at = $3 WHERE id = $4",
		status, errMsg, now, jobID,
	)
	pauseRequests.Delete(jobID)
	log.Printf("[embed-job] %s complete: %d embedded, %d failed", jobID, embedded, failed)
}

// GetEmbedJobStatus returns the current status of an embed job.
func (h *BotBuilderHandler) GetEmbedJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("job_id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, "Job ID is required")
		return
	}

	var status, errorMessage string
	var totalChunks, embedded, failed int
	var startedAt time.Time
	var finishedAt *time.Time

	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT status, total_chunks, embedded, failed,
		        COALESCE(error_message, ''), started_at, finished_at
		 FROM embed_jobs WHERE id = $1`, jobID,
	).Scan(&status, &totalChunks, &embedded, &failed,
		&errorMessage, &startedAt, &finishedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "Embed job not found")
		return
	}

	resp := map[string]interface{}{
		"id":           jobID,
		"status":       status,
		"total_chunks": totalChunks,
		"embedded":     embedded,
		"failed":       failed,
		"started_at":   startedAt,
	}
	if errorMessage != "" {
		resp["error_message"] = errorMessage
	}
	if finishedAt != nil {
		resp["finished_at"] = *finishedAt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ---------- Helper: Get Project Setup Status ----------

// GetSetupStatus returns the project's current setup step and document/chunk stats.
func (h *BotBuilderHandler) GetSetupStatus(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	// Verify ownership
	var ownerID, websiteURL string
	var websiteURLs []string
	var fallbackResponseText, customFallbackFieldsJSON string
	var setupStep int
	var hasAPIKey bool
	var fallbackResponseEnabled bool
	var llmModel string
	var llmRPM, llmTPM, llmRPD, maxInputTokens int
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT user_id, COALESCE(website_url, ''), COALESCE(website_urls, '{}'), setup_step, 
		        (gemini_api_key_encrypted IS NOT NULL AND gemini_api_key_encrypted != ''),
		        COALESCE(llm_model, 'gemini-2.5-flash'), COALESCE(llm_rpm, 5), COALESCE(llm_tpm, 250000),
		        COALESCE(llm_rpd, 20), COALESCE(max_input_tokens, 50000),
		        COALESCE(fallback_response_enabled, true),
		        COALESCE(fallback_response_text, 'I don''t have that information in my knowledge base. Please contact support.'),
		        COALESCE(custom_fallback_fields::text, '[]')
		 FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID, &websiteURL, &websiteURLs, &setupStep, &hasAPIKey, &llmModel, &llmRPM, &llmTPM, &llmRPD, &maxInputTokens, &fallbackResponseEnabled, &fallbackResponseText, &customFallbackFieldsJSON)
	if err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	customFallbackFields := []string{}
	if customFallbackFieldsJSON != "" {
		if err := json.Unmarshal([]byte(customFallbackFieldsJSON), &customFallbackFields); err != nil {
			customFallbackFields = []string{}
		}
	}

	// Count documents
	var docCount int
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM documents WHERE project_id = $1", projectID,
	).Scan(&docCount)

	// Count chunks
	var chunkCount, embeddedCount, pendingChunks int
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1", projectID,
	).Scan(&chunkCount)
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1 AND embedding IS NOT NULL", projectID,
	).Scan(&embeddedCount)
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1 AND embedding IS NULL", projectID,
	).Scan(&pendingChunks)

	// Get document list
	docRows, err := h.DB.Pool.Query(r.Context(),
		`SELECT id, source_url, source_type, title, status, created_at,
		        LENGTH(raw_content) as content_length
		 FROM documents WHERE project_id = $1 ORDER BY created_at DESC`, projectID,
	)
	var documents []map[string]interface{}
	if err == nil {
		defer docRows.Close()
		for docRows.Next() {
			var id, sourceURL, sourceType, title, status string
			var createdAt time.Time
			var contentLength int
			if err := docRows.Scan(&id, &sourceURL, &sourceType, &title, &status, &createdAt, &contentLength); err != nil {
				continue
			}
			documents = append(documents, map[string]interface{}{
				"id":             id,
				"source_url":     sourceURL,
				"source_type":    sourceType,
				"title":          title,
				"status":         status,
				"created_at":     createdAt,
				"content_length": contentLength,
			})
		}
	}

	// Check for active crawl/embed jobs
	var activeCrawlJobID, activeEmbedJobID *string
	var cjID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM crawl_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&cjID)
	if err == nil {
		activeCrawlJobID = &cjID
	}
	var ejID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM embed_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&ejID)
	if err == nil {
		activeEmbedJobID = &ejID
	}

	w.Header().Set("Content-Type", "application/json")
	resp := map[string]interface{}{
		"setup_step":                setupStep,
		"website_url":               websiteURL,
		"website_urls":              websiteURLs,
		"has_api_key":               hasAPIKey,
		"document_count":            docCount,
		"chunk_count":               chunkCount,
		"embedded_count":            embeddedCount,
		"pending_chunks":            pendingChunks,
		"documents":                 documents,
		"llm_model":                 llmModel,
		"llm_rpm":                   llmRPM,
		"llm_tpm":                   llmTPM,
		"llm_rpd":                   llmRPD,
		"max_input_tokens":          maxInputTokens,
		"fallback_response_enabled": fallbackResponseEnabled,
		"fallback_response_text":    fallbackResponseText,
		"custom_fallback_fields":    customFallbackFields,
	}
	if activeCrawlJobID != nil {
		resp["active_crawl_job_id"] = *activeCrawlJobID
	}
	if activeEmbedJobID != nil {
		resp["active_embed_job_id"] = *activeEmbedJobID
	}
	json.NewEncoder(w).Encode(resp)
}

// ---------- Console: Knowledge Base Endpoints ----------

// GetDocuments returns documents with raw_content for the knowledge base viewer.
func (h *BotBuilderHandler) GetDocuments(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	rows, err := h.DB.Pool.Query(r.Context(),
		`SELECT id, source_url, source_type, title, raw_content, content_hash, status, created_at
		 FROM documents WHERE project_id = $1 ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch documents")
		return
	}
	defer rows.Close()

	var docs []map[string]interface{}
	for rows.Next() {
		var id, sourceURL, sourceType, title, rawContent, contentHash, status string
		var createdAt time.Time
		if err := rows.Scan(&id, &sourceURL, &sourceType, &title, &rawContent, &contentHash, &status, &createdAt); err != nil {
			continue
		}
		wordCount := len(strings.Fields(rawContent))
		docs = append(docs, map[string]interface{}{
			"id":          id,
			"source_url":  sourceURL,
			"source_type": sourceType,
			"title":       title,
			"raw_content": rawContent,
			"word_count":  wordCount,
			"status":      status,
			"created_at":  createdAt,
		})
	}

	if docs == nil {
		docs = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"documents": docs,
		"count":     len(docs),
	})
}

// GetChunks returns chunks for a specific document or all chunks for a project.
func (h *BotBuilderHandler) GetChunks(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	documentID := r.URL.Query().Get("document_id")

	var query string
	var args []interface{}
	if documentID != "" {
		query = `SELECT c.id, c.document_id, c.chunk_index, c.content, 
		                (c.embedding IS NOT NULL) as has_embedding, d.title as doc_title
		         FROM chunks c JOIN documents d ON c.document_id = d.id
		         WHERE c.project_id = $1 AND c.document_id = $2 ORDER BY c.chunk_index`
		args = []interface{}{projectID, documentID}
	} else {
		query = `SELECT c.id, c.document_id, c.chunk_index, c.content,
		                (c.embedding IS NOT NULL) as has_embedding, d.title as doc_title
		         FROM chunks c JOIN documents d ON c.document_id = d.id
		         WHERE c.project_id = $1 ORDER BY d.title, c.chunk_index`
		args = []interface{}{projectID}
	}

	dbRows, err := h.DB.Pool.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch chunks")
		return
	}
	defer dbRows.Close()

	var chunks []map[string]interface{}
	for dbRows.Next() {
		var id, docID, content, docTitle string
		var chunkIndex int
		var hasEmbedding bool
		if err := dbRows.Scan(&id, &docID, &chunkIndex, &content, &hasEmbedding, &docTitle); err != nil {
			continue
		}
		chunks = append(chunks, map[string]interface{}{
			"id":            id,
			"document_id":   docID,
			"chunk_index":   chunkIndex,
			"content":       content,
			"has_embedding": hasEmbedding,
			"doc_title":     docTitle,
			"word_count":    len(strings.Fields(content)),
		})
	}

	if chunks == nil {
		chunks = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunks": chunks,
		"count":  len(chunks),
	})
}

// TestChat handles authenticated chat testing from the console.
func (h *BotBuilderHandler) TestChat(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Reuse the public chat handler logic by forwarding to it
	// but first set the bot_token path value
	r.SetPathValue("bot_token", projectID)

	chatHandler := &ChatHandler{DB: h.DB}
	chatHandler.Chat(w, r)
}

const (
	maxCustomizationIconBytes = 250 * 1024
	imagekitUploadEndpoint    = "https://upload.imagekit.io/api/v1/files/upload"
)

var (
	hexColorPattern = regexp.MustCompile(`^#([0-9A-Fa-f]{6})$`)
	rgbColorPattern = regexp.MustCompile(`^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$`)
)

type imagekitUploadResponse struct {
	FileID       string `json:"fileId"`
	Name         string `json:"name"`
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnailUrl"`
	FileType     string `json:"fileType"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
}

func verifyProjectOwnership(ctx context.Context, db *database.DB, projectID, userID string) error {
	var ownerID string
	err := db.Pool.QueryRow(ctx,
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil {
		return fmt.Errorf("project lookup failed: %w", err)
	}
	if ownerID != userID {
		return fmt.Errorf("not owner")
	}
	return nil
}

func validateThemeColor(input string) bool {
	trimmed := strings.TrimSpace(input)
	if hexColorPattern.MatchString(trimmed) {
		return true
	}
	if !rgbColorPattern.MatchString(trimmed) {
		return false
	}
	parts := strings.Split(trimmed, ",")
	if len(parts) != 3 {
		return false
	}
	for _, p := range parts {
		var v int
		if _, err := fmt.Sscanf(strings.TrimSpace(p), "%d", &v); err != nil {
			return false
		}
		if v < 0 || v > 255 {
			return false
		}
	}
	return true
}

func sanitizeSVG(raw []byte) ([]byte, error) {
	txt := strings.ToLower(string(raw))
	for _, needle := range []string{"<script", "javascript:", "onload=", "onerror=", "<iframe", "<object", "<embed", "<foreignobject"} {
		if strings.Contains(txt, needle) {
			return nil, fmt.Errorf("svg contains disallowed content")
		}
	}
	return raw, nil
}

func verifyAndSanitizeIcon(file multipart.File, header *multipart.FileHeader) ([]byte, string, string, error) {
	defer file.Close()

	if header.Size > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("icon exceeds 250KB limit")
	}

	raw, err := io.ReadAll(io.LimitReader(file, maxCustomizationIconBytes+1))
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to read icon: %w", err)
	}
	if len(raw) == 0 {
		return nil, "", "", fmt.Errorf("empty icon file")
	}
	if len(raw) > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("icon exceeds 250KB limit")
	}

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
	allowedExt := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "svg": true}
	if !allowedExt[ext] {
		return nil, "", "", fmt.Errorf("unsupported icon format")
	}

	if ext == "svg" {
		sanitized, svgErr := sanitizeSVG(raw)
		if svgErr != nil {
			return nil, "", "", svgErr
		}
		return sanitized, "image/svg+xml", "svg", nil
	}

	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", "", fmt.Errorf("invalid image content")
	}
	if format != "jpeg" && format != "png" && format != "webp" {
		return nil, "", "", fmt.Errorf("unsupported image content")
	}

	// Re-encode raster images to PNG to strip unwanted binary payload/metadata.
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, "", "", fmt.Errorf("failed to sanitize image")
	}
	if out.Len() > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("sanitized icon exceeds 250KB limit")
	}

	return out.Bytes(), "image/png", "png", nil
}

func uploadIconToImageKit(iconBytes []byte, contentType, filename string) (*imagekitUploadResponse, error) {
	privateKey := strings.TrimSpace(os.Getenv("IMAGEKIT_PRIVATE_KEY"))
	if privateKey == "" {
		return nil, fmt.Errorf("IMAGEKIT_PRIVATE_KEY is not set")
	}

	folder := strings.TrimSpace(os.Getenv("IMAGEKIT_UPLOAD_FOLDER"))
	if folder == "" {
		folder = "/chatcraft/customization"
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create multipart file: %w", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(iconBytes)); err != nil {
		return nil, fmt.Errorf("failed to write file content: %w", err)
	}

	if err := writer.WriteField("fileName", filename); err != nil {
		return nil, err
	}
	if err := writer.WriteField("useUniqueFileName", "true"); err != nil {
		return nil, err
	}
	if err := writer.WriteField("folder", folder); err != nil {
		return nil, err
	}
	if err := writer.WriteField("isPublished", "true"); err != nil {
		return nil, err
	}
	if err := writer.WriteField("tags", "chatcraft,customization,icon"); err != nil {
		return nil, err
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, imagekitUploadEndpoint, body)
	if err != nil {
		return nil, fmt.Errorf("failed to build imagekit request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	encoded := base64.StdEncoding.EncodeToString([]byte(privateKey + ":"))
	req.Header.Set("Authorization", "Basic "+encoded)
	req.Header.Set("X-Content-Type", contentType)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("imagekit upload failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read imagekit response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("imagekit upload error: status %d body %s", resp.StatusCode, string(respBytes))
	}

	var out imagekitUploadResponse
	if err := json.Unmarshal(respBytes, &out); err != nil {
		return nil, fmt.Errorf("invalid imagekit response: %w", err)
	}
	if strings.TrimSpace(out.URL) == "" {
		return nil, fmt.Errorf("imagekit response missing url")
	}

	return &out, nil
}

// ---------- Console: Project Settings ----------

// UpdateProjectSettings updates the project name.
func (h *BotBuilderHandler) UpdateProjectSettings(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Project name is required")
		return
	}

	log.Printf("[DB] UPDATE projects SET name='%s' WHERE id = %s", req.Name, projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2",
		req.Name, projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR updating project name: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update project")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Project updated successfully",
	})
}

// UpdateBehaviorSettings updates fallback behavior settings for chat responses.
func (h *BotBuilderHandler) UpdateBehaviorSettings(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req struct {
		FallbackResponseEnabled bool     `json:"fallback_response_enabled"`
		FallbackResponseText    string   `json:"fallback_response_text"`
		CustomFallbackFields    []string `json:"custom_fallback_fields"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	defaultFallback := "I don't have that information in my knowledge base. Please contact support."
	req.FallbackResponseText = strings.TrimSpace(req.FallbackResponseText)
	if req.FallbackResponseText == "" {
		req.FallbackResponseText = defaultFallback
	}

	cleanFields := make([]string, 0, len(req.CustomFallbackFields))
	seen := map[string]bool{}
	for _, field := range req.CustomFallbackFields {
		f := strings.TrimSpace(field)
		if f == "" {
			continue
		}
		if seen[f] {
			continue
		}
		seen[f] = true
		cleanFields = append(cleanFields, f)
		if len(cleanFields) >= 10 {
			break
		}
	}

	fieldsJSON, err := json.Marshal(cleanFields)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid custom fallback fields")
		return
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE projects
		 SET fallback_response_enabled = $1,
		     fallback_response_text = $2,
		     custom_fallback_fields = $3::jsonb,
		     updated_at = NOW()
		 WHERE id = $4`,
		req.FallbackResponseEnabled, req.FallbackResponseText, string(fieldsJSON), projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR updating behavior settings: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update behavior settings")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":                   "Behavior settings updated successfully",
		"fallback_response_enabled": req.FallbackResponseEnabled,
		"fallback_response_text":    req.FallbackResponseText,
		"custom_fallback_fields":    cleanFields,
	})
}

// SaveBotCustomization validates customization payload and persists it.
// If icon_file is present, the icon is verified and uploaded server-side to ImageKit.
func (h *BotBuilderHandler) SaveBotCustomization(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if err := verifyProjectOwnership(r.Context(), h.DB, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	if err := r.ParseMultipartForm(2 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart payload")
		return
	}

	themeColor := strings.TrimSpace(r.FormValue("theme_color"))
	fontFamily := strings.TrimSpace(r.FormValue("font_family"))
	iconSource := strings.TrimSpace(r.FormValue("icon_source"))
	selectedIconURL := strings.TrimSpace(r.FormValue("selected_icon_url"))

	if themeColor == "" || !validateThemeColor(themeColor) {
		writeError(w, http.StatusBadRequest, "Invalid theme color")
		return
	}
	if fontFamily == "" {
		fontFamily = "Roboto"
	}
	if iconSource == "" {
		iconSource = "none"
	}

	iconURL := selectedIconURL
	file, header, err := r.FormFile("icon_file")
	if err == nil {
		iconBytes, contentType, extension, verifyErr := verifyAndSanitizeIcon(file, header)
		if verifyErr != nil {
			writeError(w, http.StatusBadRequest, "Icon verification failed: "+verifyErr.Error())
			return
		}

		uploadName := fmt.Sprintf("project-%s-icon-%d.%s", projectID, time.Now().Unix(), extension)
		uploadResp, uploadErr := uploadIconToImageKit(iconBytes, contentType, uploadName)
		if uploadErr != nil {
			log.Printf("[customization] ImageKit upload failed: %v", uploadErr)
			writeError(w, http.StatusBadGateway, "Failed to upload icon")
			return
		}
		iconURL = uploadResp.URL
		iconSource = "uploaded"
	} else if err != http.ErrMissingFile {
		writeError(w, http.StatusBadRequest, "Invalid icon upload payload")
		return
	}

	if iconSource == "uploaded" && iconURL == "" {
		writeError(w, http.StatusBadRequest, "Uploaded icon URL missing")
		return
	}

	_, execErr := h.DB.Pool.Exec(r.Context(),
		`INSERT INTO bot_customizations (project_id, icon_url, theme_color, font_family, icon_source, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (project_id)
		 DO UPDATE SET icon_url = EXCLUDED.icon_url,
		               theme_color = EXCLUDED.theme_color,
		               font_family = EXCLUDED.font_family,
		               icon_source = EXCLUDED.icon_source,
		               updated_at = NOW()`,
		projectID, iconURL, themeColor, fontFamily, iconSource,
	)
	if execErr != nil {
		log.Printf("[customization] DB upsert failed: %v", execErr)
		writeError(w, http.StatusInternalServerError, "Failed to save customization")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":         "Customization saved successfully",
		"project_id":      projectID,
		"icon_url":        iconURL,
		"theme_color":     themeColor,
		"font_family":     fontFamily,
		"icon_source":     iconSource,
		"uploaded_to_cdn": iconSource == "uploaded",
	})
}

// GetBotCustomization returns persisted customization settings for a project.
func (h *BotBuilderHandler) GetBotCustomization(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if err := verifyProjectOwnership(r.Context(), h.DB, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var iconURL, themeColor, fontFamily, iconSource string
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT icon_url, theme_color, font_family, icon_source
		 FROM bot_customizations
		 WHERE project_id = $1`,
		projectID,
	).Scan(&iconURL, &themeColor, &fontFamily, &iconSource)
	if err != nil {
		if err != pgx.ErrNoRows {
			log.Printf("[customization] failed to fetch settings: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to fetch customization")
			return
		}
		// Return defaults when customization has not been saved yet.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"project_id":  projectID,
			"icon_url":    "",
			"theme_color": "#DC2626",
			"font_family": "Roboto",
			"icon_source": "none",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":  projectID,
		"icon_url":    iconURL,
		"theme_color": themeColor,
		"font_family": fontFamily,
		"icon_source": iconSource,
	})
}

// DeleteProjectData deletes all data (documents, chunks, jobs, conversations) for a project but keeps the project itself.
func (h *BotBuilderHandler) DeleteProjectData(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	ctx := r.Context()

	// Delete in order: chunks → documents → crawl_jobs → embed_jobs → conversations
	log.Printf("[DB] Deleting all data for project %s", projectID)
	h.DB.Pool.Exec(ctx, "DELETE FROM chunks WHERE project_id = $1", projectID)
	h.DB.Pool.Exec(ctx, "DELETE FROM documents WHERE project_id = $1", projectID)
	h.DB.Pool.Exec(ctx, "DELETE FROM crawl_jobs WHERE project_id = $1", projectID)
	h.DB.Pool.Exec(ctx, "DELETE FROM embed_jobs WHERE project_id = $1", projectID)
	h.DB.Pool.Exec(ctx, "DELETE FROM conversations WHERE project_id = $1", projectID)

	// Reset project setup_step to 0
	_, err = h.DB.Pool.Exec(ctx,
		"UPDATE projects SET setup_step = 0, website_url = NULL, website_urls = '{}', status = 'draft', updated_at = NOW() WHERE id = $1",
		projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR resetting project: %v", err)
	}

	log.Printf("[DB] OK deleted all data for project %s", projectID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "All project data deleted successfully",
	})
}

// ---------- Utility ----------

// SaveModelSelection saves the user's chosen LLM model and its rate limits.
func (h *BotBuilderHandler) SaveModelSelection(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var ownerID string
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req struct {
		Model          string `json:"model"`
		RPM            int    `json:"rpm"`
		TPM            int    `json:"tpm"`
		RPD            int    `json:"rpd"`
		MaxInputTokens int    `json:"max_input_tokens"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Model == "" {
		writeError(w, http.StatusBadRequest, "Model name is required")
		return
	}

	// Validate model name
	validModels := map[string]bool{
		"gemini-2.5-flash": true,
		"gemma-3-12b-it":   true,
		"gemma-3-27b-it":   true,
		"gemini-2.0-flash": true,
	}
	if !validModels[req.Model] {
		writeError(w, http.StatusBadRequest, "Invalid model name")
		return
	}

	log.Printf("[DB] UPDATE projects SET llm_model='%s' rpm=%d tpm=%d rpd=%d max_input=%d WHERE id=%s",
		req.Model, req.RPM, req.TPM, req.RPD, req.MaxInputTokens, projectID)

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE projects SET llm_model = $1, llm_rpm = $2, llm_tpm = $3, llm_rpd = $4, max_input_tokens = $5, updated_at = NOW()
		 WHERE id = $6`,
		req.Model, req.RPM, req.TPM, req.RPD, req.MaxInputTokens, projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR updating model selection: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to save model selection")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Model selection saved successfully",
	})
}

// stripHTMLTags does a basic HTML tag removal for uploaded .html files.
func stripHTMLTags(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			result.WriteRune(' ')
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// normalizeCrawlURL canonicalizes URL keys so incremental hash checks remain stable
// across host casing, trailing slashes, and URL fragments.
func normalizeCrawlURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return strings.TrimSpace(raw)
	}

	u.Fragment = ""
	u.Host = strings.ToLower(u.Host)
	if u.Path != "/" {
		u.Path = strings.TrimRight(u.Path, "/")
		if u.Path == "" {
			u.Path = "/"
		}
	}

	return u.String()
}
