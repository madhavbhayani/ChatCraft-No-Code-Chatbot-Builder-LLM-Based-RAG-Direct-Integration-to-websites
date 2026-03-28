package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/config"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/service"

	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"google.golang.org/genai"
)

// ChatHandler handles public RAG chat requests from embedded widgets.
type ChatHandler struct {
	DB *database.DB
}

const (
	chatSessionRequestLimit  = 25
	chatSessionWindow        = 5 * time.Minute
	chatSessionCleanupWindow = 10 * time.Minute
)

type chatSessionWindowState struct {
	WindowStart time.Time
	LastSeen    time.Time
	Count       int
}

type chatSessionRateLimiter struct {
	mu          sync.Mutex
	limit       int
	window      time.Duration
	cleanupTTL  time.Duration
	lastCleanup time.Time
	sessions    map[string]chatSessionWindowState
}

func newChatSessionRateLimiter(limit int, window, cleanupTTL time.Duration) *chatSessionRateLimiter {
	return &chatSessionRateLimiter{
		limit:      limit,
		window:     window,
		cleanupTTL: cleanupTTL,
		sessions:   make(map[string]chatSessionWindowState),
	}
}

func (rl *chatSessionRateLimiter) allow(sessionKey string, now time.Time) (allowed bool, remaining int, retryAfter time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if sessionKey == "" {
		sessionKey = "anonymous"
	}

	if rl.lastCleanup.IsZero() || now.Sub(rl.lastCleanup) >= time.Minute {
		for key, state := range rl.sessions {
			if now.Sub(state.LastSeen) > rl.cleanupTTL {
				delete(rl.sessions, key)
			}
		}
		rl.lastCleanup = now
	}

	state, ok := rl.sessions[sessionKey]
	if !ok || now.Sub(state.WindowStart) >= rl.window {
		state = chatSessionWindowState{
			WindowStart: now,
			LastSeen:    now,
			Count:       1,
		}
		rl.sessions[sessionKey] = state
		return true, rl.limit - 1, rl.window
	}

	state.LastSeen = now
	if state.Count >= rl.limit {
		rl.sessions[sessionKey] = state
		retryAfter = rl.window - now.Sub(state.WindowStart)
		if retryAfter < 0 {
			retryAfter = 0
		}
		return false, 0, retryAfter
	}

	state.Count++
	rl.sessions[sessionKey] = state
	remaining = rl.limit - state.Count
	if remaining < 0 {
		remaining = 0
	}
	retryAfter = rl.window - now.Sub(state.WindowStart)
	if retryAfter < 0 {
		retryAfter = 0
	}

	return true, remaining, retryAfter
}

var chatLimiter = newChatSessionRateLimiter(chatSessionRequestLimit, chatSessionWindow, chatSessionCleanupWindow)

// searchResult holds a single RAG search result with metadata.
type searchResult struct {
	Content        string
	SourceURL      string
	Similarity     float64
	PageTitle      string
	SectionHeading string
	ChunkType      string
	Embedding      []float32
}

// NewChatHandler creates a ChatHandler.
func NewChatHandler(db *database.DB) *ChatHandler {
	return &ChatHandler{DB: db}
}

// ChatRequest is the JSON body for POST /api/v1/chat/{bot_token}
type ChatRequest struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
	Stream    bool   `json:"stream,omitempty"`
}

// ChatResponse is the JSON response for the chat endpoint.
type ChatResponse struct {
	Answer     string   `json:"answer"`
	Sources    []string `json:"sources"`
	Confidence float64  `json:"confidence"`
	Fallback   bool     `json:"fallback"`
}

// Chat handles a RAG chat request. This endpoint is PUBLIC (no auth).
// The bot_token is the project_id for now.
func (h *ChatHandler) Chat(w http.ResponseWriter, r *http.Request) {
	botToken := r.PathValue("bot_token")
	if botToken == "" {
		writeError(w, http.StatusBadRequest, "Bot token is required")
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		writeError(w, http.StatusBadRequest, "Message is required")
		return
	}

	if req.SessionID == "" {
		req.SessionID = fallbackSessionIDFromRequest(r)
	}

	now := time.Now()
	rateKey := botToken + "|" + req.SessionID
	allowed, remaining, retryAfter := chatLimiter.allow(rateKey, now)
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(chatSessionRequestLimit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
	w.Header().Set("X-RateLimit-Window-Seconds", strconv.Itoa(int(chatSessionWindow.Seconds())))
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "Rate limit exceeded: max 25 messages per session every 5 minutes")
		return
	}

	ctx := r.Context()
	streamMode := req.Stream || strings.Contains(strings.ToLower(r.Header.Get("Accept")), "text/event-stream")

	// Step 1: Resolve project from bot_token (bot_token = project_id for now)
	var projectID, encryptedKey, systemPrompt, botName, llmModel string
	var fallbackResponseText, customFallbackFieldsJSON string
	var maxInputTokens int
	var fallbackResponseEnabled bool
	err := h.DB.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(gemini_api_key_encrypted, ''), COALESCE(system_prompt, ''), COALESCE(bot_name, ''),
		        COALESCE(llm_model, 'gemini-2.5-flash'), COALESCE(max_input_tokens, 50000),
		        COALESCE(fallback_response_enabled, true),
		        COALESCE(fallback_response_text, 'I don''t have that information in my knowledge base. Please contact support.'),
		        COALESCE(custom_fallback_fields::text, '[]')
		 FROM projects
		 WHERE id = $1 AND status = 'active'`, botToken,
	).Scan(&projectID, &encryptedKey, &systemPrompt, &botName, &llmModel, &maxInputTokens, &fallbackResponseEnabled, &fallbackResponseText, &customFallbackFieldsJSON)
	if err != nil {
		writeError(w, http.StatusNotFound, "Bot not found or inactive")
		return
	}

	customFallbackFields := []string{}
	if customFallbackFieldsJSON != "" {
		if err := json.Unmarshal([]byte(customFallbackFieldsJSON), &customFallbackFields); err != nil {
			customFallbackFields = []string{}
		}
	}

	if encryptedKey == "" {
		writeError(w, http.StatusBadRequest, "Bot not configured — missing API key")
		return
	}

	// Step 2: Decrypt the Gemini API key
	apiKey, err := service.DecryptString(encryptedKey)
	if err != nil {
		log.Printf("[chat] decrypt key error: %v", err)
		writeError(w, http.StatusInternalServerError, "Internal error")
		return
	}

	// Step 3: Embed the user's question (RETRIEVAL_QUERY task type + query expansion)
	questionEmbedding, err := service.EmbedQueryForSearch(ctx, apiKey, req.Message)
	if err != nil {
		log.Printf("[chat] embed question error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to process question")
		return
	}

	ragCfg := config.GetRAGConfig()

	// Step 4: Vector similarity search using configured threshold and limit.
	vec := pgvector.NewVector(questionEmbedding)
	rows, err := h.DB.Pool.Query(ctx,
		`SELECT c.content, d.source_url,
		        1 - (c.embedding <=> $1) AS similarity,
		        COALESCE(d.title, '') AS page_title,
		        COALESCE(c.section_heading, '') AS section_heading,
		        COALESCE(c.chunk_type, 'text') AS chunk_type
		 FROM chunks c
		 JOIN documents d ON c.document_id = d.id
		 WHERE c.project_id = $2
		   AND c.embedding IS NOT NULL
		   AND 1 - (c.embedding <=> $1) > $3
		 ORDER BY similarity DESC
		 LIMIT $4`,
		vec, projectID, ragCfg.SimilarityThresh, ragCfg.MaxContextChunks,
	)
	if err != nil {
		log.Printf("[chat] vector search error: %v", err)
		writeError(w, http.StatusInternalServerError, "Search failed")
		return
	}
	defer rows.Close()

	var results []searchResult
	for rows.Next() {
		var sr searchResult
		if err := rows.Scan(&sr.Content, &sr.SourceURL, &sr.Similarity,
			&sr.PageTitle, &sr.SectionHeading, &sr.ChunkType); err != nil {
			continue
		}
		results = append(results, sr)
	}

	// Step 4b: Keyword fallback — if vector search found < 2 results, try OR-based keyword matching
	if len(results) < 2 {
		words := strings.Fields(strings.ToLower(req.Message))
		var conditions []string
		var args []interface{}
		args = append(args, projectID) // $1
		argIdx := 2
		for _, w := range words {
			cleaned := strings.Trim(w, ".,!?\"'()[]{}:;")
			if len(cleaned) >= 3 {
				conditions = append(conditions, fmt.Sprintf("LOWER(c.content) LIKE $%d", argIdx))
				args = append(args, "%"+cleaned+"%")
				argIdx++
			}
		}
		if len(conditions) > 0 {
			kwSQL := fmt.Sprintf(
				`SELECT c.content, d.source_url, 0.55 AS similarity,
				        COALESCE(d.title, '') AS page_title,
				        COALESCE(c.section_heading, '') AS section_heading,
				        COALESCE(c.chunk_type, 'text') AS chunk_type
				 FROM chunks c
				 JOIN documents d ON c.document_id = d.id
				 WHERE c.project_id = $1
				   AND (%s)
				 LIMIT 5`, strings.Join(conditions, " OR "))
			kwRows, kwErr := h.DB.Pool.Query(ctx, kwSQL, args...)
			if kwErr == nil {
				existingIDs := make(map[string]bool)
				for _, r := range results {
					key := r.Content[:min(50, len(r.Content))]
					existingIDs[key] = true
				}
				for kwRows.Next() {
					var sr searchResult
					if kwRows.Scan(&sr.Content, &sr.SourceURL, &sr.Similarity,
						&sr.PageTitle, &sr.SectionHeading, &sr.ChunkType) == nil {
						key := sr.Content[:min(50, len(sr.Content))]
						if !existingIDs[key] {
							results = append(results, sr)
							existingIDs[key] = true
						}
					}
				}
				kwRows.Close()
			}
		}
	}

	// Step 5: Confidence check
	var topScore float64
	if len(results) > 0 {
		topScore = results[0].Similarity
	}

	response := ChatResponse{
		Confidence: topScore,
	}

	// Determine assistant name for prompts
	assistantName := "this website"
	if botName != "" {
		assistantName = botName
	}

	if len(results) == 0 {
		var (
			sseFlusher      http.Flusher
			sseReady        bool
			didStreamTokens bool
		)
		if streamMode {
			var ok bool
			sseFlusher, ok = prepareSSE(w)
			if !ok {
				writeError(w, http.StatusInternalServerError, "Streaming is not supported")
				return
			}
			sseReady = true
		}

		// No relevant results — use configured fallback, optionally with custom contact fields.
		if fallbackResponseEnabled {
			base := strings.TrimSpace(fallbackResponseText)
			if base == "" {
				base = "I don't have that information in my knowledge base. Please contact support."
			}
			if len(customFallbackFields) > 0 {
				lines := []string{base, "", "You can contact us via:"}
				for _, field := range customFallbackFields {
					f := strings.TrimSpace(field)
					if f != "" {
						lines = append(lines, "- "+f)
					}
				}
				response.Answer = strings.Join(lines, "\n")
			} else {
				response.Answer = base
			}
		} else {
			fallbackPrompt := fmt.Sprintf(
				`You are a helpful assistant for %s.
The user asked a question but no relevant information was found in your knowledge base.
Politely let them know you don't have specific information about their query in the knowledge base.
Still try to be helpful — suggest they rephrase or provide more context.
Be concise, friendly, and professional. Keep response under 80 words.`,
				assistantName,
			)

			if streamMode {
				streamedAnswer, streamErr := callGeminiStream(ctx, apiKey, llmModel, fallbackPrompt, req.Message, func(chunk string) error {
					if chunk == "" {
						return nil
					}
					didStreamTokens = true
					return writeSSEEvent(w, sseFlusher, "token", map[string]string{"text": chunk})
				})

				if streamErr != nil {
					log.Printf("[chat] fallback streaming LLM error: %v", streamErr)
					if strings.TrimSpace(streamedAnswer) == "" {
						streamedAnswer = "I don't have specific information about that in my knowledge base. Could you try rephrasing your question, or reach out to support for more help?"
						didStreamTokens = true
						_ = writeSSEEvent(w, sseFlusher, "token", map[string]string{"text": streamedAnswer})
					}
				}

				response.Answer = stripSourcesSection(streamedAnswer)
			} else {
				fallbackAnswer, llmErr := callGemini(ctx, apiKey, llmModel, fallbackPrompt, req.Message)
				if llmErr != nil {
					log.Printf("[chat] fallback LLM error: %v", llmErr)
					response.Answer = "I don't have specific information about that in my knowledge base. Could you try rephrasing your question, or reach out to support for more help?"
				} else {
					response.Answer = fallbackAnswer
				}
			}
		}
		response.Fallback = true
		response.Sources = []string{}
		if strings.TrimSpace(response.Answer) == "" {
			response.Answer = "I don't have that information in my knowledge base. Please contact support."
		}

		// Store conversation
		h.storeConversation(ctx, projectID, req.SessionID, req.Message, response.Answer, 0, true)

		if streamMode {
			if sseReady {
				if !didStreamTokens {
					_ = writeSSEEvent(w, sseFlusher, "token", map[string]string{"text": response.Answer})
				}
				_ = writeSSEEvent(w, sseFlusher, "done", response)
			}
		} else {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		}
		return
	}

	// Step 6: MMR rerank + build structured labelled context.
	// Use more than a fixed 5 chunks so broad questions (e.g., "all pricing")
	// can include complete details present in the knowledge base.
	topK := ragCfg.MaxContextChunks
	if topK < 5 {
		topK = 5
	}
	topResults := mmrRerank(results, topK, 0.8)

	var contextParts []string
	sourceURLsByNumber := make([]string, len(topResults))
	sourceSet := make(map[string]bool)
	for i, r := range topResults {
		sourceURLsByNumber[i] = strings.TrimSpace(r.SourceURL)
		label := fmt.Sprintf("[Source %d", i+1)
		if r.PageTitle != "" {
			label += " | " + r.PageTitle
		}
		if r.SectionHeading != "" {
			label += " > " + r.SectionHeading
		}
		if r.ChunkType == "faq" {
			label += " | FAQ"
		}
		label += "]"
		contextParts = append(contextParts, label+"\n"+r.Content)
		if r.SourceURL != "" && !sourceSet[r.SourceURL] {
			sourceSet[r.SourceURL] = true
			response.Sources = append(response.Sources, r.SourceURL)
		}
	}
	contextText := strings.Join(contextParts, "\n---\n")

	// Truncate context to fit within maxInputTokens (rough estimate: 1 token ≈ 4 chars)
	maxContextChars := maxInputTokens * 4
	if len(contextText) > maxContextChars {
		contextText = contextText[:maxContextChars]
	}

	sysPrompt := systemPrompt
	if sysPrompt == "" {
		sysPrompt = fmt.Sprintf(
			`You are %s, a friendly and knowledgeable assistant.

RULES:
1. Answer ONLY from the [Source ...] blocks below.
2. If you use information from a source, reference it inline as [Source N].
3. If the sources contain FAQ-type content (Q: / A:), prefer it for direct questions.
4. If the context does not contain the answer, say:
   "I don't have that information in my knowledge base. Please contact support."
5. Keep answers under 150 words unless the user asks for detail.
6. Use short paragraphs and bullet points for readability.
7. Never invent facts, URLs, phone numbers, or prices not in the context.
8. Do NOT add a separate "Sources" section at the end. Citations must stay inline.
9. If the user explicitly asks for a table/comparison, respond with a markdown table whenever the context allows.
10. Use valid markdown table syntax with a header row, a separator row (---), and data rows.
11. Use tables for structured/comparable data; otherwise use normal text.
12. Keep tables concise (recommended max 5 columns, max 8 rows).
13. Never return a vague one-line summary when the context contains concrete facts.
14. If context includes numeric details (prices, limits, dates, counts), include those exact values.
15. If the user asks for "all", "complete", or "full" details, list every relevant item found in the provided context.`,
			assistantName,
		)
	}

	tableGuidance := `Formatting guidance:
- Do not create tables for narrative text.
- If user asks for a table or comparison, prefer table output.
- Create tables for concise, comparable facts (e.g., pricing, plans, feature comparisons).
- Always include the markdown separator row, for example:
  | Column A | Column B |
  | --- | --- |
  | Value 1 | Value 2 |
- Keep table content short and useful.`

	fullSystemPrompt := sysPrompt + "\n\n" + tableGuidance + "\n\nContext:\n" + contextText

	if streamMode {
		flusher, ok := prepareSSE(w)
		if !ok {
			writeError(w, http.StatusInternalServerError, "Streaming is not supported")
			return
		}

		answer, streamErr := callGeminiStream(ctx, apiKey, llmModel, fullSystemPrompt, req.Message, func(chunk string) error {
			if chunk == "" {
				return nil
			}
			return writeSSEEvent(w, flusher, "token", map[string]string{"text": chunk})
		})

		if streamErr != nil {
			log.Printf("[chat] Gemini streaming LLM error: %v", streamErr)
			if strings.TrimSpace(answer) == "" {
				response.Answer = "I'm having trouble generating a response right now. Please try again."
				response.Fallback = true
				_ = writeSSEEvent(w, flusher, "token", map[string]string{"text": response.Answer})
			} else {
				response.Answer = replaceSourceReferencesWithLinks(stripSourcesSection(answer), sourceURLsByNumber)
			}
		} else {
			response.Answer = replaceSourceReferencesWithLinks(stripSourcesSection(answer), sourceURLsByNumber)
		}

		if response.Sources == nil {
			response.Sources = []string{}
		}

		// Store conversation
		h.storeConversation(ctx, projectID, req.SessionID, req.Message, response.Answer, topScore, response.Fallback)
		_ = writeSSEEvent(w, flusher, "done", response)
		return
	}

	// Call Gemini generative model (non-streaming mode)
	answer, err := callGemini(ctx, apiKey, llmModel, fullSystemPrompt, req.Message)
	if err != nil {
		log.Printf("[chat] Gemini LLM error: %v", err)
		response.Answer = "I'm having trouble generating a response right now. Please try again."
		response.Fallback = true
	} else {
		response.Answer = replaceSourceReferencesWithLinks(stripSourcesSection(answer), sourceURLsByNumber)
	}

	if response.Sources == nil {
		response.Sources = []string{}
	}

	// Step 8: Store conversation
	h.storeConversation(ctx, projectID, req.SessionID, req.Message, response.Answer, topScore, response.Fallback)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

var sourceRefRegex = regexp.MustCompile(`\[Source\s+(\d+)\]`)

func replaceSourceReferencesWithLinks(answer string, sourceURLsByNumber []string) string {
	if answer == "" || len(sourceURLsByNumber) == 0 {
		return answer
	}

	return sourceRefRegex.ReplaceAllStringFunc(answer, func(match string) string {
		parts := sourceRefRegex.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		n, err := strconv.Atoi(parts[1])
		if err != nil || n < 1 || n > len(sourceURLsByNumber) {
			return match
		}

		src := strings.TrimSpace(sourceURLsByNumber[n-1])
		if src == "" || (!strings.HasPrefix(src, "http://") && !strings.HasPrefix(src, "https://")) {
			return match
		}

		return fmt.Sprintf("[Source %d](%s)", n, src)
	})
}

func stripSourcesSection(answer string) string {
	if answer == "" {
		return answer
	}

	lines := strings.Split(answer, "\n")
	for i, line := range lines {
		normalized := strings.ToLower(strings.TrimSpace(line))
		if normalized == "sources" || normalized == "source" ||
			strings.HasPrefix(normalized, "sources:") || strings.HasPrefix(normalized, "source:") {
			return strings.TrimSpace(strings.Join(lines[:i], "\n"))
		}
	}

	return strings.TrimSpace(answer)
}

// mmrRerank applies Maximal Marginal Relevance to balance relevance and diversity.
// lambda controls the trade-off: 1.0 = pure relevance, 0.0 = pure diversity.
func mmrRerank(results []searchResult, topK int, lambda float64) []searchResult {
	if len(results) <= topK {
		return results
	}

	selected := []searchResult{results[0]}
	used := map[int]bool{0: true}

	for len(selected) < topK {
		bestIdx := -1
		bestScore := -math.MaxFloat64

		for i, cand := range results {
			if used[i] {
				continue
			}

			// Max similarity between candidate and already-selected items
			maxSim := 0.0
			for _, sel := range selected {
				sim := contentSimilarity(cand.Content, sel.Content)
				if sim > maxSim {
					maxSim = sim
				}
			}

			mmrScore := lambda*cand.Similarity - (1-lambda)*maxSim
			if mmrScore > bestScore {
				bestScore = mmrScore
				bestIdx = i
			}
		}

		if bestIdx < 0 {
			break
		}
		selected = append(selected, results[bestIdx])
		used[bestIdx] = true
	}

	return selected
}

// contentSimilarity computes a simple Jaccard word-overlap similarity between two texts.
func contentSimilarity(a, b string) float64 {
	wordsA := make(map[string]bool)
	for _, w := range strings.Fields(strings.ToLower(a)) {
		wordsA[w] = true
	}
	wordsB := make(map[string]bool)
	for _, w := range strings.Fields(strings.ToLower(b)) {
		wordsB[w] = true
	}

	intersection := 0
	for w := range wordsA {
		if wordsB[w] {
			intersection++
		}
	}

	union := len(wordsA) + len(wordsB) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

// callGemini calls the Gemini generative model for RAG response.
func callGemini(ctx context.Context, apiKey, modelName, systemPrompt, userMessage string) (string, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return "", fmt.Errorf("create client: %w", err)
	}

	result, err := client.Models.GenerateContent(ctx, modelName, []*genai.Content{
		genai.NewContentFromText(userMessage, genai.RoleUser),
	}, &genai.GenerateContentConfig{
		SystemInstruction: genai.NewContentFromText(systemPrompt, genai.RoleUser),
		MaxOutputTokens:   2048,
		Temperature:       genai.Ptr[float32](0.2),
	})
	if err != nil {
		return "", fmt.Errorf("generate content: %w", err)
	}

	if result == nil || len(result.Candidates) == 0 || result.Candidates[0].Content == nil {
		return "", fmt.Errorf("no response from model")
	}

	var answer strings.Builder
	for _, part := range result.Candidates[0].Content.Parts {
		if part.Text != "" {
			answer.WriteString(part.Text)
		}
	}

	return strings.TrimSpace(answer.String()), nil
}

// callGeminiStream streams model output and invokes onChunk for each text delta.
func callGeminiStream(ctx context.Context, apiKey, modelName, systemPrompt, userMessage string, onChunk func(string) error) (string, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return "", fmt.Errorf("create client: %w", err)
	}

	var fullAnswer string
	stream := client.Models.GenerateContentStream(ctx, modelName, []*genai.Content{
		genai.NewContentFromText(userMessage, genai.RoleUser),
	}, &genai.GenerateContentConfig{
		SystemInstruction: genai.NewContentFromText(systemPrompt, genai.RoleUser),
		MaxOutputTokens:   2048,
		Temperature:       genai.Ptr[float32](0.2),
	})

	for chunkResp, chunkErr := range stream {
		if chunkErr != nil {
			return strings.TrimSpace(fullAnswer), fmt.Errorf("generate content stream: %w", chunkErr)
		}
		if chunkResp == nil {
			continue
		}

		text := chunkResp.Text()
		if text == "" {
			continue
		}

		delta := text
		if strings.HasPrefix(text, fullAnswer) {
			delta = strings.TrimPrefix(text, fullAnswer)
			fullAnswer = text
		} else {
			fullAnswer += text
		}

		if delta == "" {
			continue
		}
		if onChunk != nil {
			if err := onChunk(delta); err != nil {
				return strings.TrimSpace(fullAnswer), err
			}
		}
	}

	return strings.TrimSpace(fullAnswer), nil
}

func prepareSSE(w http.ResponseWriter) (http.Flusher, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}

	headers := w.Header()
	headers.Set("Content-Type", "text/event-stream")
	headers.Set("Cache-Control", "no-cache")
	headers.Set("Connection", "keep-alive")
	headers.Set("X-Accel-Buffering", "no")

	flusher.Flush()
	return flusher, true
}

func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, event string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

func fallbackSessionIDFromRequest(r *http.Request) string {
	if raw := strings.TrimSpace(r.Header.Get("X-Session-ID")); raw != "" {
		return raw
	}

	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return "anon:" + ip
			}
		}
	}

	if cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cfIP != "" {
		return "anon:" + cfIP
	}

	remote := strings.TrimSpace(r.RemoteAddr)
	if remote != "" {
		host, _, err := net.SplitHostPort(remote)
		if err == nil && strings.TrimSpace(host) != "" {
			return "anon:" + strings.TrimSpace(host)
		}
		return "anon:" + remote
	}

	return uuid.New().String()
}

// storeConversation saves a chat exchange to the conversations table.
func (h *ChatHandler) storeConversation(ctx context.Context, projectID, sessionID, userMessage, botAnswer string, confidence float64, fallback bool) {
	convID := uuid.New().String()
	_, err := h.DB.Pool.Exec(ctx,
		`INSERT INTO conversations (id, project_id, session_id, user_message, bot_answer, confidence, fallback, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
		convID, projectID, sessionID, userMessage, botAnswer, confidence, fallback,
	)
	if err != nil {
		log.Printf("[chat] store conversation error: %v", err)
	}
}
