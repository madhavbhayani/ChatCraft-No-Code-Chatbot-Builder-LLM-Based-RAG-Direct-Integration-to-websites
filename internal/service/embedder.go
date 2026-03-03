package service

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

// EmbedText sends text to the Gemini Embedding API and returns a 768-dimensional vector.
// Uses the gemini-embedding-001 model (formerly text-embedding-004).
func EmbedText(ctx context.Context, apiKey string, text string) ([]float32, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	result, err := client.Models.EmbedContent(ctx, "gemini-embedding-001", []*genai.Content{genai.NewContentFromText(text, genai.RoleUser)}, nil)
	if err != nil {
		return nil, fmt.Errorf("embedding API call failed: %w", err)
	}

	if result == nil || len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return result.Embeddings[0].Values, nil
}

// EmbedBatch embeds multiple texts in sequence using the Gemini API.
// Returns a slice of embeddings corresponding to input texts.
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
		result, err := client.Models.EmbedContent(ctx, "gemini-embedding-001", []*genai.Content{genai.NewContentFromText(text, genai.RoleUser)}, nil)
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
	_, err := EmbedText(ctx, apiKey, "test")
	return err
}
