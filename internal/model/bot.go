package model

import "time"

// Bot represents a chatbot created by a user.
type Bot struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	BotToken    string    `json:"bot_token,omitempty"`
	Settings    string    `json:"settings"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
