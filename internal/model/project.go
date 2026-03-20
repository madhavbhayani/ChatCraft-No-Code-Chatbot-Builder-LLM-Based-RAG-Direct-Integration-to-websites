package model

import "time"

// Project represents a chatbot project created by a user.
// Each user can have at most one project.
type Project struct {
	ID                      string    `json:"id"`
	UserID                  string    `json:"user_id"`
	Name                    string    `json:"name"`
	Description             string    `json:"description"`
	Status                  string    `json:"status"` // draft | active | paused
	WebsiteURL              string    `json:"website_url,omitempty"`
	WebsiteURLs             []string  `json:"website_urls,omitempty"`
	GeminiAPIKeyEncrypted   string    `json:"-"` // never expose
	BotName                 string    `json:"bot_name,omitempty"`
	SystemPrompt            string    `json:"system_prompt,omitempty"`
	SetupStep               int       `json:"setup_step"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
	FallbackResponseEnabled bool      `json:"fallback_response_enabled"`
	FallbackResponseText    string    `json:"fallback_response_text"`
	CustomFallbackFields    []string  `json:"custom_fallback_fields"`
}
