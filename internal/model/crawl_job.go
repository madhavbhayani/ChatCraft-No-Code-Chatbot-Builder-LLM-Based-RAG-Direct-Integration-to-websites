package model

import "time"

// CrawlJob tracks the status of an asynchronous website crawl.
type CrawlJob struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"project_id"`
	Status        string     `json:"status"` // queued | running | done | failed
	TotalURLs     int        `json:"total_urls"`
	CrawledURLs   int        `json:"crawled_urls"`
	SkippedURLs   int        `json:"skipped_urls"`
	ChunksCreated int        `json:"chunks_created"`
	ErrorMessage  string     `json:"error_message,omitempty"`
	StartedAt     time.Time  `json:"started_at"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
}
