package handler

import (
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

// CrawlWebsite crawls the given URL and stores pages as documents.
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

	// Update project website_url
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET website_url = $1, updated_at = NOW() WHERE id = $2",
		req.URL, projectID,
	)
	if err != nil {
		log.Printf("[crawl] update project URL error: %v", err)
	}

	// Crawl the website
	pages, err := service.CrawlWebsite(req.URL)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("Crawl failed: %v", err))
		return
	}

	// Delete old documents for this project (re-crawl scenario)
	_, _ = h.DB.Pool.Exec(r.Context(),
		"DELETE FROM documents WHERE project_id = $1 AND source_type = 'web'", projectID,
	)

	// Insert each crawled page as a document
	var docs []map[string]interface{}
	for _, page := range pages {
		docID := uuid.New().String()
		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(page.Content)))

		_, err := h.DB.Pool.Exec(r.Context(),
			`INSERT INTO documents (id, project_id, source_url, source_type, title, raw_content, content_hash, status, created_at)
			 VALUES ($1, $2, $3, 'web', $4, $5, $6, 'pending', NOW())`,
			docID, projectID, page.URL, page.Title, page.Content, hash,
		)
		if err != nil {
			log.Printf("[crawl] insert doc error: %v", err)
			continue
		}

		docs = append(docs, map[string]interface{}{
			"id":    docID,
			"url":   page.URL,
			"title": page.Title,
			"words": len(strings.Fields(page.Content)),
		})
	}

	// Update setup_step to at least 1
	_, _ = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET setup_step = GREATEST(setup_step, 1), updated_at = NOW() WHERE id = $1", projectID,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    fmt.Sprintf("Crawled %d pages successfully", len(docs)),
		"documents":  docs,
		"page_count": len(docs),
	})
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
		"SELECT id, raw_content FROM documents WHERE project_id = $1 AND status = 'pending'", projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch documents")
		return
	}
	defer rows.Close()

	totalChunks := 0
	for rows.Next() {
		var docID, content string
		if err := rows.Scan(&docID, &content); err != nil {
			continue
		}

		// Delete existing chunks for this document (re-chunk scenario)
		_, _ = h.DB.Pool.Exec(r.Context(),
			"DELETE FROM chunks WHERE document_id = $1", docID,
		)

		// Chunk the text (~400 words, 50 word overlap)
		chunks := service.ChunkText(content, 400, 50)

		for _, chunk := range chunks {
			chunkID := uuid.New().String()
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
		_, _ = h.DB.Pool.Exec(r.Context(),
			"UPDATE documents SET status = 'chunked' WHERE id = $1", docID,
		)
	}

	// Update setup_step to at least 2
	_, _ = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET setup_step = GREATEST(setup_step, 2), updated_at = NOW() WHERE id = $1", projectID,
	)

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
		"message":   "File uploaded successfully",
		"document_id": docID,
		"filename":  header.Filename,
		"words":     len(strings.Fields(textContent)),
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
	_, err = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET gemini_api_key_encrypted = $1, setup_step = GREATEST(setup_step, 3), updated_at = NOW() WHERE id = $2",
		encrypted, projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save API key")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "API key validated and saved successfully",
	})
}

// ---------- Step 4: Embed Chunks ----------

// EmbedChunks generates embeddings for all un-embedded chunks of a project.
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
		writeError(w, http.StatusBadRequest, "Gemini API key not configured. Complete Step 3 first.")
		return
	}

	apiKey, err := service.DecryptString(encryptedKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to decrypt API key")
		return
	}

	// Fetch all chunks without embeddings
	rows, err := h.DB.Pool.Query(r.Context(),
		"SELECT id, content FROM chunks WHERE project_id = $1 AND embedding IS NULL", projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch chunks")
		return
	}
	defer rows.Close()

	type chunkRow struct {
		ID      string
		Content string
	}
	var pendingChunks []chunkRow
	for rows.Next() {
		var c chunkRow
		if err := rows.Scan(&c.ID, &c.Content); err != nil {
			continue
		}
		pendingChunks = append(pendingChunks, c)
	}

	if len(pendingChunks) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":  "No chunks to embed",
			"embedded": 0,
		})
		return
	}

	// Embed each chunk
	embedded := 0
	for _, chunk := range pendingChunks {
		embedding, err := service.EmbedText(r.Context(), apiKey, chunk.Content)
		if err != nil {
			log.Printf("[embed] error for chunk %s: %v", chunk.ID, err)
			continue
		}

		// Store embedding using pgvector
		vec := pgvector.NewVector(embedding)
		_, err = h.DB.Pool.Exec(r.Context(),
			"UPDATE chunks SET embedding = $1 WHERE id = $2",
			vec, chunk.ID,
		)
		if err != nil {
			log.Printf("[embed] update error for chunk %s: %v", chunk.ID, err)
			continue
		}
		embedded++
	}

	// Mark documents as embedded
	_, _ = h.DB.Pool.Exec(r.Context(),
		`UPDATE documents SET status = 'embedded' 
		 WHERE project_id = $1 AND status = 'chunked'`, projectID,
	)

	// Update setup_step to 4 (complete)
	_, _ = h.DB.Pool.Exec(r.Context(),
		"UPDATE projects SET setup_step = 4, status = 'active', updated_at = NOW() WHERE id = $1", projectID,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  fmt.Sprintf("Embedded %d/%d chunks", embedded, len(pendingChunks)),
		"embedded": embedded,
		"total":    len(pendingChunks),
	})
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
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT user_id, COALESCE(website_url, ''), setup_step, 
		        (gemini_api_key_encrypted IS NOT NULL AND gemini_api_key_encrypted != '')
		 FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID, &websiteURL, &setupStep, &hasAPIKey)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"setup_step":     setupStep,
		"website_url":    websiteURL,
		"has_api_key":    hasAPIKey,
		"document_count": docCount,
		"chunk_count":    chunkCount,
		"embedded_count": embeddedCount,
		"documents":      documents,
	})
}

// ---------- Utility ----------

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
