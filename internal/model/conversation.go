package model

import "time"

// Conversation stores a single chat exchange for analytics.
type Conversation struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	SessionID   string    `json:"session_id"`
	UserMessage string    `json:"user_message"`
	BotAnswer   string    `json:"bot_answer"`
	Confidence  float64   `json:"confidence"`
	Fallback    bool      `json:"fallback"`
	CreatedAt   time.Time `json:"created_at"`
}
