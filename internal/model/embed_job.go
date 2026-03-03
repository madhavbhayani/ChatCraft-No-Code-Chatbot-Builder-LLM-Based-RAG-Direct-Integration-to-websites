package model

import "time"

// EmbedJob tracks the status of an asynchronous embedding job.
type EmbedJob struct {
	ID           string     `json:"id"`
	ProjectID    string     `json:"project_id"`
	Status       string     `json:"status"` // queued | running | done | failed
	TotalChunks  int        `json:"total_chunks"`
	Embedded     int        `json:"embedded"`
	Failed       int        `json:"failed"`
	ErrorMessage string     `json:"error_message,omitempty"`
	StartedAt    time.Time  `json:"started_at"`
	FinishedAt   *time.Time `json:"finished_at,omitempty"`
}
