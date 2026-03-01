package server

import (
	"net/http"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/handler"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/middleware"
)

// NewRouter builds the HTTP router with all routes and middleware.
func NewRouter(db *database.DB) http.Handler {
	mux := http.NewServeMux()

	// --- Health ---
	mux.HandleFunc("GET /api/v1/health", handler.HealthHandler)

	// --- Auth ---
	authHandler := handler.NewAuthHandler(db)
	mux.HandleFunc("POST /api/v1/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)

	// Apply middleware stack
	var h http.Handler = mux
	h = middleware.Logger(h)
	h = middleware.CORS(h)

	return h
}
