package middleware

import (
	"net/http"
	"strings"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/service"
)

// Auth validates the Authorization JWT and injects X-User-ID into the request.
func Auth(db *database.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"Authorization header required"}`, http.StatusUnauthorized)
				return
			}

			token := strings.TrimPrefix(authHeader, "Bearer ")
			if token == "" || token == authHeader {
				http.Error(w, `{"error":"Invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			userID, err := service.ValidateJWT(token)
			if err != nil {
				http.Error(w, `{"error":"Invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			// Ensure user still exists.
			var existsUserID string
			err = db.Pool.QueryRow(r.Context(),
				"SELECT id FROM users WHERE id = $1", userID,
			).Scan(&existsUserID)
			if err != nil {
				http.Error(w, `{"error":"Invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			// Inject user ID into request for downstream handlers
			r.Header.Set("X-User-ID", userID)
			next.ServeHTTP(w, r)
		})
	}
}
