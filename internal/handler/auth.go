package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler holds dependencies for authentication endpoints.
type AuthHandler struct {
	DB *database.DB
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(db *database.DB) *AuthHandler {
	return &AuthHandler{DB: db}
}

// RegisterRequest is the JSON body for POST /api/v1/auth/register.
type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest is the JSON body for POST /api/v1/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned on successful auth operations.
type AuthResponse struct {
	Token string     `json:"token"`
	User  model.User `json:"user"`
}

// Register handles user registration.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Name, email, and password are required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[auth] bcrypt error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to process password")
		return
	}

	// Insert user
	user := model.User{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Email:     req.Email,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		user.ID, user.Name, user.Email, string(hash), user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "An account with this email already exists")
			return
		}
		log.Printf("[auth] insert error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create account")
		return
	}

	// TODO: Generate a real JWT token
	token := "placeholder-jwt-token"

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user,
	})
}

// Login handles user authentication.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	// Fetch user
	var user model.User
	var passwordHash string
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &passwordHash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// TODO: Generate a real JWT token
	token := "placeholder-jwt-token"

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user,
	})
}

// writeError sends a JSON error response.
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
