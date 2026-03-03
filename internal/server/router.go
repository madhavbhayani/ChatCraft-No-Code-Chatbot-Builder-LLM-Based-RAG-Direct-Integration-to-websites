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

	// --- Auth (public) ---
	authHandler := handler.NewAuthHandler(db)
	mux.HandleFunc("POST /api/v1/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)

	// --- Google Auth + OTP (public) ---
	googleHandler := handler.NewGoogleHandler(db)
	mux.HandleFunc("POST /api/v1/auth/google", googleHandler.GoogleAuth)
	mux.HandleFunc("POST /api/v1/auth/send-otp", googleHandler.SendOTP)
	mux.HandleFunc("POST /api/v1/auth/verify-otp", googleHandler.VerifyOTP)
	mux.HandleFunc("POST /api/v1/auth/forgot-password", googleHandler.ForgotPassword)
	mux.HandleFunc("POST /api/v1/auth/reset-password", googleHandler.ResetPassword)

	// --- Protected routes (require auth) ---
	authMw := middleware.Auth(db)

	// Auth - me
	mux.Handle("GET /api/v1/auth/me", authMw(http.HandlerFunc(authHandler.Me)))

	// Projects
	projectHandler := handler.NewProjectHandler(db)
	mux.Handle("GET /api/v1/projects", authMw(http.HandlerFunc(projectHandler.GetProject)))
	mux.Handle("POST /api/v1/projects", authMw(http.HandlerFunc(projectHandler.CreateProject)))
	mux.Handle("DELETE /api/v1/projects", authMw(http.HandlerFunc(projectHandler.DeleteProject)))

	// Account management (protected)
	mux.Handle("GET /api/v1/account", authMw(http.HandlerFunc(googleHandler.GetAccountInfo)))
	mux.Handle("POST /api/v1/account/link-google", authMw(http.HandlerFunc(googleHandler.LinkGoogle)))
	mux.Handle("POST /api/v1/account/setup-password", authMw(http.HandlerFunc(googleHandler.SetupPassword)))
	mux.Handle("POST /api/v1/account/change-email", authMw(http.HandlerFunc(googleHandler.ChangeEmail)))
	mux.Handle("POST /api/v1/account/confirm-email", authMw(http.HandlerFunc(googleHandler.ConfirmChangeEmail)))
	mux.Handle("DELETE /api/v1/account", authMw(http.HandlerFunc(googleHandler.DeleteAccount)))

	// Bot Builder / Console (protected)
	botBuilder := handler.NewBotBuilderHandler(db)
	mux.Handle("GET /api/v1/console/status/{project_id}", authMw(http.HandlerFunc(botBuilder.GetSetupStatus)))
	mux.Handle("POST /api/v1/console/crawl/{project_id}", authMw(http.HandlerFunc(botBuilder.CrawlWebsite)))
	mux.Handle("POST /api/v1/console/chunk/{project_id}", authMw(http.HandlerFunc(botBuilder.ChunkDocuments)))
	mux.Handle("POST /api/v1/console/upload/{project_id}", authMw(http.HandlerFunc(botBuilder.UploadFile)))
	mux.Handle("POST /api/v1/console/api-key/{project_id}", authMw(http.HandlerFunc(botBuilder.SaveAPIKey)))
	mux.Handle("POST /api/v1/console/embed/{project_id}", authMw(http.HandlerFunc(botBuilder.EmbedChunks)))

	// Apply middleware stack
	var h http.Handler = mux
	h = middleware.Logger(h)
	h = middleware.CORS(h)

	return h
}
