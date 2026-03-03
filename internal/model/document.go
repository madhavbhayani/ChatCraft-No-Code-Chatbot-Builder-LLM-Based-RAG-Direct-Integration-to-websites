package model

import "time"

// Document represents a crawled page or uploaded file.
type Document struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	SourceURL   string    `json:"source_url"`
	SourceType  string    `json:"source_type"` // web | upload
	Title       string    `json:"title"`
	RawContent  string    `json:"raw_content"`
	ContentHash string    `json:"content_hash"`
	Status      string    `json:"status"` // pending | chunked | embedded
	CreatedAt   time.Time `json:"created_at"`
}
