package handler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/service"

	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
)

// BotBuilderHandler holds dependencies for bot builder endpoints.
type BotBuilderHandler struct {
	DB *database.DB
}

// NewBotBuilderHandler creates a BotBuilderHandler.
func NewBotBuilderHandler(db *database.DB) *BotBuilderHandler {
	return &BotBuilderHandler{DB: db}
}

// ---------- Step 1: Crawl Website ----------

// CrawlRequest is the JSON body for POST /api/v1/console/crawl/{project_id}
type CrawlRequest struct {
	URL string `json:"url"`
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

	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "URL is required")
		return
	}

	// Ensure URL has scheme
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		req.URL = "https://" + req.URL
	}

	// Check if there's already an active crawl job for this project
	var activeJobID string
	err = h.DB.Pool.QueryRow(r.Context(),
		"SELECT id FROM crawl_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY started_at DESC LIMIT 1",
		projectID,
	).Scan(&activeJobID)
	if err == nil && activeJobID != "" {
		// Already running — return the existing job ID
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Crawl job already running",
			"job_id":  activeJobID,
		})
		return
	}

	// Update project website_url
	log.Printf("[DB] UPDATE projects SET website_url = '%s' WHERE id = %s", req.URL, projectID)
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET website_url = $1, updated_at = NOW() WHERE id = $2",
		req.URL, projectID,
	)
	if err != nil {
		log.Printf("[DB] ERROR update project URL: %v", err)
	} else {
		log.Printf("[DB] OK updated project website_url")
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
	go h.runCrawlJob(jobID, projectID, req.URL)

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
func (h *BotBuilderHandler) runCrawlJob(jobID, projectID, crawlURL string) {
	ctx := context.Background()
	log.Printf("[crawl-job] STARTING job=%s project=%s url=%s", jobID, projectID, crawlURL)

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
	prog.addLog("Starting crawl for " + crawlURL)
	prog.addLog("Discovering sitemap and robots.txt...")
	h.writeCrawlProgress(jobID, prog, true) // force=true

	// --- CRAWL (this blocks for a while — but now reports per-page progress) ---
	log.Printf("[crawl-job] SmartCrawl starting for %s", crawlURL)
	result, err := service.SmartCrawl(crawlURL, func(pagesFound, thinSkipped, errors int, currentURL string) {
		// This callback is called from inside SmartCrawl for every page
		prog.TotalURLs = pagesFound + thinSkipped + errors
		prog.CrawledURLs = pagesFound
		prog.SkippedURLs = thinSkipped
		prog.addLog(fmt.Sprintf("Found page (%d total, %d skipped): %s", pagesFound, thinSkipped, currentURL))
		h.writeCrawlProgress(jobID, prog, false) // throttled — writes max every 3s
	})
	if err != nil {
		log.Printf("[crawl-job] SmartCrawl FAILED: %v", err)
		prog.Phase = "failed"
		prog.addLog(fmt.Sprintf("Crawl failed: %s", err.Error()))
		h.writeCrawlProgress(jobID, prog, true) // force write final state
		now := time.Now()
		h.DB.Pool.Exec(ctx,
			"UPDATE crawl_jobs SET status = 'failed', error_message = $1, finished_at = $2, current_phase = 'failed' WHERE id = $3",
			err.Error(), now, jobID,
		)
		log.Printf("[DB] UPDATE crawl_jobs SET status='failed' WHERE id = %s", jobID)
		return
	}
	log.Printf("[crawl-job] SmartCrawl DONE: %d pages, %d thin skipped",
		len(result.Pages), result.Report.ThinContentSkipped)

	totalDiscovered := len(result.Pages) + result.Report.ThinContentSkipped + result.Report.ErrorCount
	prog.TotalURLs = totalDiscovered
	prog.addLog(fmt.Sprintf("Crawl complete: %d pages extracted, %d thin-content skipped",
		len(result.Pages), result.Report.ThinContentSkipped))
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
				existingHashes[srcURL] = hash
				existingIDs[srcURL] = id
			}
		}
		rows.Close()
	}

	// --- PROCESS PAGES ---
	newURLs := make(map[string]bool)
	crawledCount := 0
	skippedCount := 0

	prog.Phase = "processing"
	for i, page := range result.Pages {
		newURLs[page.URL] = true
		rawContent := service.ComposeRawContent(page)
		newHash := fmt.Sprintf("%x", sha256.Sum256([]byte(rawContent)))
		wordCount := len(strings.Fields(rawContent))

		if oldHash, exists := existingHashes[page.URL]; exists && oldHash == newHash {
			skippedCount++
			prog.addLog(fmt.Sprintf("⏭ Unchanged: %s", page.URL))
			prog.SkippedURLs = skippedCount
			prog.CrawledURLs = crawledCount
			// Throttled write (every 3s)
			h.writeCrawlProgress(jobID, prog, false)
			continue
		}

		if oldID, exists := existingIDs[page.URL]; exists {
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
		forceWrite := (i+1)%5 == 0 || i == len(result.Pages)-1
		h.writeCrawlProgress(jobID, prog, forceWrite)
	}

	// Delete documents whose URLs no longer appear in the new crawl
	for srcURL, oldID := range existingIDs {
		if !newURLs[srcURL] {
			h.DB.Pool.Exec(ctx, "DELETE FROM documents WHERE id = $1", oldID)
			prog.addLog(fmt.Sprintf("🗑 Removed (no longer on site): %s", srcURL))
		}
	}

	// Update setup_step to 2 (crawl done — user must chunk manually in Step 3)
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
	prog.addLog(fmt.Sprintf("All done! %d new/updated, %d unchanged. Ready for chunking.",
		crawledCount, skippedCount))
	h.writeCrawlProgress(jobID, prog, true) // force final write

	now := time.Now()
	_, err = h.DB.Pool.Exec(ctx,
		`UPDATE crawl_jobs SET status = 'done', crawled_urls = $1, skipped_urls = $2,
		 total_urls = $3, chunks_created = 0, finished_at = $4, current_phase = 'done'
		 WHERE id = $5`,
		crawledCount, skippedCount, totalDiscovered, now, jobID,
	)
	if err != nil {
		log.Printf("[crawl-job] ERROR marking job done: %v", err)
	} else {
		log.Printf("[DB] UPDATE crawl_jobs SET status='done' WHERE id = %s", jobID)
	}

	log.Printf("[crawl-job] %s COMPLETE: %d crawled, %d skipped",
		jobID, crawledCount, skippedCount)
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
		chunks := service.SmartChunkText(title, content, 400, 50)

		for _, chunk := range chunks {
			chunkID := uuid.New().String()
			log.Printf("[DB] INSERT INTO chunks (id=%s, doc=%s, idx=%d)", chunkID[:8], docID[:8], chunk.Index)
			_, err := h.DB.Pool.Exec(r.Context(),
				`INSERT INTO chunks (id, document_id, project_id, chunk_index, content, created_at)
				 VALUES ($1, $2, $3, $4, $5, NOW())`,
				chunkID, docID, projectID, chunk.Index, chunk.Content,
			)
			if err != nil {
				log.Printf("[chunk] insert error: %v", err)
				continue
			}
			totalChunks++
		}

		// Mark document as chunked
		log.Printf("[DB] UPDATE documents SET status='chunked' WHERE id = %s", docID[:8])
		_, _ = h.DB.Pool.Exec(r.Context(),
			"UPDATE documents SET status = 'chunked' WHERE id = $1", docID,
		)
	}

	// Update setup_step to at least 3
	log.Printf("[DB] UPDATE projects SET setup_step = GREATEST(setup_step, 3) WHERE id = %s", projectID)
	_, _ = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET setup_step = GREATEST(setup_step, 3), updated_at = NOW() WHERE id = $1", projectID,
	)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":     "File uploaded successfully",
		"document_id": docID,
		"filename":    header.Filename,
		"words":       len(strings.Fields(textContent)),
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

// runEmbedJob embeds all pending chunks in the background.
func (h *BotBuilderHandler) runEmbedJob(jobID, projectID, apiKey string) {
	ctx := context.Background()

	// Mark job as running
	log.Printf("[DB] UPDATE embed_jobs SET status='running' WHERE id = %s", jobID)
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
	for _, chunk := range pendingChunks {
		embedding, err := service.EmbedText(ctx, apiKey, chunk.Content)
		if err != nil {
			log.Printf("[embed-job] error for chunk %s: %v", chunk.ID, err)
			failed++
			// Update progress
			h.DB.Pool.Exec(ctx,
				"UPDATE embed_jobs SET embedded = $1, failed = $2 WHERE id = $3",
				embedded, failed, jobID,
			)
			continue
		}

		vec := pgvector.NewVector(embedding)
		_, err = h.DB.Pool.Exec(ctx,
			"UPDATE chunks SET embedding = $1 WHERE id = $2",
			vec, chunk.ID,
		)
		if err != nil {
			log.Printf("[embed-job] update error for chunk %s: %v", chunk.ID, err)
			failed++
		} else {
			embedded++
		}

		// Update progress every chunk
		h.DB.Pool.Exec(ctx,
			"UPDATE embed_jobs SET embedded = $1, failed = $2 WHERE id = $3",
			embedded, failed, jobID,
		)
	}

	// Mark documents as embedded
	h.DB.Pool.Exec(ctx,
		`UPDATE documents SET status = 'embedded' 
		 WHERE project_id = $1 AND status = 'chunked'`, projectID,
	)

	// Update setup_step to 4 (complete)
	h.DB.Pool.Exec(ctx,
		"UPDATE projects SET setup_step = 4, status = 'active', updated_at = NOW() WHERE id = $1",
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
	var setupStep int
	var hasAPIKey bool
	var llmModel string
	var llmRPM, llmTPM, llmRPD, maxInputTokens int
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT user_id, COALESCE(website_url, ''), setup_step, 
		        (gemini_api_key_encrypted IS NOT NULL AND gemini_api_key_encrypted != ''),
		        COALESCE(llm_model, 'gemini-2.5-flash'), COALESCE(llm_rpm, 5), COALESCE(llm_tpm, 250000),
		        COALESCE(llm_rpd, 20), COALESCE(max_input_tokens, 50000)
		 FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID, &websiteURL, &setupStep, &hasAPIKey, &llmModel, &llmRPM, &llmTPM, &llmRPD, &maxInputTokens)
	if err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if ownerID != userID {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	// Count documents
	var docCount int
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM documents WHERE project_id = $1", projectID,
	).Scan(&docCount)

	// Count chunks
	var chunkCount, embeddedCount int
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1", projectID,
	).Scan(&chunkCount)
	h.DB.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM chunks WHERE project_id = $1 AND embedding IS NOT NULL", projectID,
	).Scan(&embeddedCount)

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
		"setup_step":       setupStep,
		"website_url":      websiteURL,
		"has_api_key":      hasAPIKey,
		"document_count":   docCount,
		"chunk_count":      chunkCount,
		"embedded_count":   embeddedCount,
		"documents":        documents,
		"llm_model":        llmModel,
		"llm_rpm":          llmRPM,
		"llm_tpm":          llmTPM,
		"llm_rpd":          llmRPD,
		"max_input_tokens": maxInputTokens,
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
		"UPDATE projects SET setup_step = 0, website_url = NULL, status = 'draft', updated_at = NOW() WHERE id = $1",
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
