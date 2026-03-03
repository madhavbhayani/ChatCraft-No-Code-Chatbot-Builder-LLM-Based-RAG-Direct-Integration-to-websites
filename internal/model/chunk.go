package model

import "time"

// Chunk represents a text chunk with its embedding vector.
type Chunk struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"document_id"`
	ProjectID  string    `json:"project_id"`
	ChunkIndex int       `json:"chunk_index"`
	Content    string    `json:"content"`
	Embedding  []float32 `json:"embedding,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}
