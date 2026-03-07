package service

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

// EmbedText sends text to the Gemini Embedding API and returns a 768-dimensional vector.
// Backward-compatible wrapper — delegates to EmbedChunkForStorage.
func EmbedText(ctx context.Context, apiKey string, text string) ([]float32, error) {
	return EmbedChunkForStorage(ctx, apiKey, text)
}

// EmbedChunkForStorage embeds content for storage using TaskType RETRIEVAL_DOCUMENT.
func EmbedChunkForStorage(ctx context.Context, apiKey string, text string) ([]float32, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	result, err := client.Models.EmbedContent(ctx, "gemini-embedding-001",
		[]*genai.Content{genai.NewContentFromText(text, genai.RoleUser)},
		&genai.EmbedContentConfig{
			OutputDimensionality: genai.Ptr(int32(768)),
			TaskType:             "RETRIEVAL_DOCUMENT",
		},
	)
	if err != nil {
		return nil, fmt.Errorf("embedding API call failed: %w", err)
	}

	if result == nil || len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return result.Embeddings[0].Values, nil
}

// EmbedQueryForSearch embeds a user query for semantic search using
// TaskType RETRIEVAL_QUERY. It first expands the query with synonyms.
func EmbedQueryForSearch(ctx context.Context, apiKey string, query string) ([]float32, error) {
	expanded := ExpandQuery(query)

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	result, err := client.Models.EmbedContent(ctx, "gemini-embedding-001",
		[]*genai.Content{genai.NewContentFromText(expanded, genai.RoleUser)},
		&genai.EmbedContentConfig{
			OutputDimensionality: genai.Ptr(int32(768)),
			TaskType:             "RETRIEVAL_QUERY",
		},
	)
	if err != nil {
		return nil, fmt.Errorf("query embedding API call failed: %w", err)
	}

	if result == nil || len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return result.Embeddings[0].Values, nil
}

// ExpandQuery appends domain-neutral synonyms to the user's question
// so the embedding covers more of the vector space.
func ExpandQuery(query string) string {
	synonyms := map[string]string{
		"price":    "cost pricing fee",
		"cost":     "price pricing fee",
		"hours":    "schedule time open close",
		"schedule": "hours time open close",
		"location": "address directions where",
		"address":  "location directions where",
		"contact":  "phone email reach",
		"return":   "refund exchange policy",
		"refund":   "return exchange policy",
		"shipping": "delivery send dispatch",
		"delivery": "shipping send dispatch",
		"cancel":   "cancellation stop end",
		"warranty": "guarantee coverage protection",
		"support":  "help assistance service",
		"help":     "support assistance service",
	}

	lower := strings.ToLower(query)
	extra := []string{}
	for keyword, syns := range synonyms {
		if strings.Contains(lower, keyword) {
			extra = append(extra, syns)
		}
	}

	if len(extra) > 0 {
		return query + " " + strings.Join(extra, " ")
	}
	return query
}

// EmbedBatch embeds multiple texts in sequence using the Gemini API.
// Uses RETRIEVAL_DOCUMENT task type for storage embeddings.
func EmbedBatch(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	embeddings := make([][]float32, 0, len(texts))

	for _, text := range texts {
		result, err := client.Models.EmbedContent(ctx, "gemini-embedding-001",
			[]*genai.Content{genai.NewContentFromText(text, genai.RoleUser)},
			&genai.EmbedContentConfig{
				OutputDimensionality: genai.Ptr(int32(768)),
				TaskType:             "RETRIEVAL_DOCUMENT",
			},
		)
		if err != nil {
			return nil, fmt.Errorf("embedding failed for text: %w", err)
		}

		if result == nil || len(result.Embeddings) == 0 {
			return nil, fmt.Errorf("no embedding returned")
		}

		embeddings = append(embeddings, result.Embeddings[0].Values)
	}

	return embeddings, nil
}

// ValidateGeminiKey tests if the given API key works by making a small embedding call.
func ValidateGeminiKey(ctx context.Context, apiKey string) error {
	_, err := EmbedChunkForStorage(ctx, apiKey, "test")
	return err
}
