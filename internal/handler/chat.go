package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

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

// NewChatHandler creates a ChatHandler.
func NewChatHandler(db *database.DB) *ChatHandler {
	return &ChatHandler{DB: db}
}

// ChatRequest is the JSON body for POST /api/v1/chat/{bot_token}
type ChatRequest struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
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
		req.SessionID = uuid.New().String()
	}

	ctx := r.Context()

	// Step 1: Resolve project from bot_token (bot_token = project_id for now)
	var projectID, encryptedKey, systemPrompt, botName, llmModel string
	var maxInputTokens int
	err := h.DB.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(gemini_api_key_encrypted, ''), COALESCE(system_prompt, ''), COALESCE(bot_name, ''),
		        COALESCE(llm_model, 'gemini-2.5-flash'), COALESCE(max_input_tokens, 50000)
		 FROM projects
		 WHERE id = $1 AND status = 'active'`, botToken,
	).Scan(&projectID, &encryptedKey, &systemPrompt, &botName, &llmModel, &maxInputTokens)
	if err != nil {
		writeError(w, http.StatusNotFound, "Bot not found or inactive")
		return
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

	// Step 3: Embed the user's question
	questionEmbedding, err := service.EmbedText(ctx, apiKey, req.Message)
	if err != nil {
		log.Printf("[chat] embed question error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to process question")
		return
	}

	// Step 4: Vector similarity search
	vec := pgvector.NewVector(questionEmbedding)
	rows, err := h.DB.Pool.Query(ctx,
		`SELECT c.content, d.source_url,
		        1 - (c.embedding <=> $1) AS similarity
		 FROM chunks c
		 JOIN documents d ON c.document_id = d.id
		 WHERE c.project_id = $2
		   AND 1 - (c.embedding <=> $1) > 0.65
		 ORDER BY similarity DESC
		 LIMIT 5`,
		vec, projectID,
	)
	if err != nil {
		log.Printf("[chat] vector search error: %v", err)
		writeError(w, http.StatusInternalServerError, "Search failed")
		return
	}
	defer rows.Close()

	type searchResult struct {
		Content    string
		SourceURL  string
		Similarity float64
	}
	var results []searchResult
	for rows.Next() {
		var sr searchResult
		if err := rows.Scan(&sr.Content, &sr.SourceURL, &sr.Similarity); err != nil {
			continue
		}
		results = append(results, sr)
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

	if len(results) == 0 || topScore < 0.65 {
		// No relevant results — use LLM to generate a helpful fallback
		fallbackPrompt := fmt.Sprintf(
			`You are a helpful assistant for %s.
The user asked a question but no relevant information was found in your knowledge base.
Politely let them know you don't have specific information about their query in the knowledge base.
Still try to be helpful — suggest they rephrase or provide more context.
Be concise, friendly, and professional. Keep response under 80 words.`,
			assistantName,
		)
		fallbackAnswer, err := callGemini(ctx, apiKey, llmModel, fallbackPrompt, req.Message)
		if err != nil {
			log.Printf("[chat] fallback LLM error: %v", err)
			response.Answer = "I don't have specific information about that in my knowledge base. Could you try rephrasing your question, or reach out to support for more help?"
		} else {
			response.Answer = fallbackAnswer
		}
		response.Fallback = true
		response.Sources = []string{}

		// Store conversation
		h.storeConversation(ctx, projectID, req.SessionID, req.Message, response.Answer, 0, true)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Step 6: Build RAG prompt and call Gemini
	// Take top 3 chunks for context
	contextLimit := 3
	if len(results) < contextLimit {
		contextLimit = len(results)
	}
	topResults := results[:contextLimit]

	var contextParts []string
	sourceSet := make(map[string]bool)
	for _, r := range topResults {
		contextParts = append(contextParts, r.Content)
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
			`You are a helpful assistant for %s.
Answer ONLY using the context provided below.
If the answer is not in the context, say: "I don't have that information. Please contact support."
Be concise and friendly.
Keep your answer under 150 words unless the question requires more detail.`,
			assistantName,
		)
	}

	fullSystemPrompt := sysPrompt + "\n\nContext:\n" + contextText

	// Call Gemini generative model
	answer, err := callGemini(ctx, apiKey, llmModel, fullSystemPrompt, req.Message)
	if err != nil {
		log.Printf("[chat] Gemini LLM error: %v", err)
		response.Answer = "I'm having trouble generating a response right now. Please try again."
		response.Fallback = true
	} else {
		response.Answer = answer
	}

	if response.Sources == nil {
		response.Sources = []string{}
	}

	// Step 8: Store conversation
	h.storeConversation(ctx, projectID, req.SessionID, req.Message, response.Answer, topScore, response.Fallback)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
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
		Temperature:       genai.Ptr[float32](0.3),
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
