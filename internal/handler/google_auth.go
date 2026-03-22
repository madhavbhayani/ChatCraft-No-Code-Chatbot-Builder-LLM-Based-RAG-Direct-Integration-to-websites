package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/model"
	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/service"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/option"
)

// GoogleHandler handles Google OAuth and OTP-related operations.
type GoogleHandler struct {
	DB         *database.DB
	fireClient *auth.Client
}

// NewGoogleHandler creates a GoogleHandler and initialises the Firebase Admin client.
func NewGoogleHandler(db *database.DB) *GoogleHandler {
	ctx := context.Background()

	var app *firebase.App
	var err error

	// Use service account JSON file (recommended)
	saPath := os.Getenv("FIREBASE_SERVICE_ACCOUNT")
	if saPath != "" {
		app, err = firebase.NewApp(ctx, nil, option.WithCredentialsFile(saPath))
	} else {
		// Fallback: use project ID only
		projectID := os.Getenv("FIREBASE_PROJECT_ID")
		if projectID == "" {
			projectID = "madhav-projects-go"
		}
		conf := &firebase.Config{ProjectID: projectID}
		app, err = firebase.NewApp(ctx, conf)
	}
	if err != nil {
		log.Printf("[google-auth] Warning: Firebase Admin init error: %v", err)
		return &GoogleHandler{DB: db}
	}

	client, err := app.Auth(ctx)
	if err != nil {
		log.Printf("[google-auth] Warning: Firebase Auth client error: %v", err)
		return &GoogleHandler{DB: db}
	}

	log.Println("[google-auth] Firebase Admin SDK initialized")
	return &GoogleHandler{DB: db, fireClient: client}
}

// GoogleAuthRequest is the JSON body for POST /api/v1/auth/google.
type GoogleAuthRequest struct {
	IDToken string `json:"id_token"`
}

// GoogleAuth verifies the Firebase ID token and creates or retrieves the user.
func (h *GoogleHandler) GoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req GoogleAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.IDToken == "" {
		writeError(w, http.StatusBadRequest, "ID token is required")
		return
	}

	ctx := r.Context()

	// Verify the Firebase ID token
	var email, name, googleID string
	if h.fireClient != nil {
		token, err := h.fireClient.VerifyIDToken(ctx, req.IDToken)
		if err != nil {
			log.Printf("[google-auth] token verification failed: %v", err)
			writeError(w, http.StatusUnauthorized, "Invalid Google token")
			return
		}
		email, _ = token.Claims["email"].(string)
		name, _ = token.Claims["name"].(string)
		googleID = token.UID
	} else {
		// Lightweight fallback: decode JWT payload without signature verification
		claims, err := decodeJWTPayload(req.IDToken)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid token format")
			return
		}
		email, _ = claims["email"].(string)
		name, _ = claims["name"].(string)
		googleID, _ = claims["sub"].(string)
	}

	if email == "" || googleID == "" {
		writeError(w, http.StatusBadRequest, "Could not extract email from Google account")
		return
	}

	email = strings.TrimSpace(strings.ToLower(email))
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	// Check if user exists by google_id
	var user model.User
	err := h.DB.Pool.QueryRow(ctx,
		`SELECT id, name, email, auth_method, google_id, email_verified, created_at, updated_at
		 FROM users WHERE google_id = $1`, googleID,
	).Scan(&user.ID, &user.Name, &user.Email, &user.AuthMethod, &user.GoogleID, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		// User doesn't exist by google_id, check by email
		var existingID string
		err2 := h.DB.Pool.QueryRow(ctx,
			`SELECT id FROM users WHERE email = $1`, email,
		).Scan(&existingID)

		if err2 == nil {
			// User exists with this email — link Google account
			_, err3 := h.DB.Pool.Exec(ctx,
				`UPDATE users SET google_id = $1,
				 auth_method = CASE WHEN auth_method = 'email' THEN 'both' ELSE 'google' END,
				 email_verified = true, updated_at = $2 WHERE id = $3`,
				googleID, time.Now(), existingID,
			)
			if err3 != nil {
				log.Printf("[google-auth] failed to link google: %v", err3)
				writeError(w, http.StatusInternalServerError, "Failed to link Google account")
				return
			}
			// Re-fetch user
			h.DB.Pool.QueryRow(ctx,
				`SELECT id, name, email, auth_method, google_id, email_verified, created_at, updated_at
				 FROM users WHERE id = $1`, existingID,
			).Scan(&user.ID, &user.Name, &user.Email, &user.AuthMethod, &user.GoogleID, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt)
		} else {
			// Brand new user — create account
			user = model.User{
				ID:            uuid.New().String(),
				Name:          name,
				Email:         email,
				AuthMethod:    "google",
				GoogleID:      &googleID,
				EmailVerified: true,
				CreatedAt:     time.Now(),
				UpdatedAt:     time.Now(),
			}

			_, err4 := h.DB.Pool.Exec(ctx,
				`INSERT INTO users (id, name, email, auth_method, google_id, email_verified, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				user.ID, user.Name, user.Email, user.AuthMethod, googleID, user.EmailVerified, user.CreatedAt, user.UpdatedAt,
			)
			if err4 != nil {
				log.Printf("[google-auth] insert error: %v", err4)
				writeError(w, http.StatusInternalServerError, "Failed to create account")
				return
			}
		}
	}

	// Issue JWT for authenticated session.
	token, err := service.GenerateJWT(user.ID)
	if err != nil {
		log.Printf("[google-auth] jwt generate error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create session token")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user,
	})
}

// decodeJWTPayload decodes the payload segment of a JWT without verifying signature.
func decodeJWTPayload(tokenStr string) (map[string]interface{}, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid JWT format")
	}

	seg := parts[1]
	// Add base64 padding
	switch len(seg) % 4 {
	case 2:
		seg += "=="
	case 3:
		seg += "="
	}

	decoded, err := base64.URLEncoding.DecodeString(seg)
	if err != nil {
		return nil, fmt.Errorf("failed to decode JWT payload: %w", err)
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse JWT claims: %w", err)
	}
	return claims, nil
}

// --- OTP Endpoints ---

// SendOTPRequest is the JSON body for POST /api/v1/auth/send-otp.
type SendOTPRequest struct {
	Email string `json:"email"`
}

// VerifyOTPRequest is the JSON body for POST /api/v1/auth/verify-otp.
type VerifyOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

// SendOTP generates and sends a 6-digit OTP to the user's email.
func (h *GoogleHandler) SendOTP(w http.ResponseWriter, r *http.Request) {
	var req SendOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "Email is required")
		return
	}

	// Generate 6-digit OTP
	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	expiresAt := time.Now().Add(10 * time.Minute)

	// Store OTP in database
	result, err := h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = $3 WHERE email = $4`,
		otp, expiresAt, time.Now(), req.Email,
	)
	if err != nil {
		log.Printf("[otp] update error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate OTP")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "No account found with this email")
		return
	}

	// Send OTP email
	if err := sendOTPEmail(req.Email, otp); err != nil {
		log.Printf("[otp] email send error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to send OTP email")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent to your email"})
}

// VerifyOTP verifies the OTP and marks email as verified.
func (h *GoogleHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req VerifyOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "Email and OTP are required")
		return
	}

	var storedOTP *string
	var expiresAt *time.Time
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT otp_code, otp_expires_at FROM users WHERE email = $1`, req.Email,
	).Scan(&storedOTP, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "No account found with this email")
		return
	}

	if storedOTP == nil || *storedOTP != req.OTP {
		writeError(w, http.StatusBadRequest, "Invalid OTP")
		return
	}
	if expiresAt == nil || time.Now().After(*expiresAt) {
		writeError(w, http.StatusBadRequest, "OTP has expired. Please request a new one.")
		return
	}

	// Mark email as verified and clear OTP
	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET email_verified = true, otp_code = NULL, otp_expires_at = NULL, updated_at = $1 WHERE email = $2`,
		time.Now(), req.Email,
	)
	if err != nil {
		log.Printf("[otp] verify update error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to verify email")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Email verified successfully"})
}

// sendOTPEmail sends the OTP code to the specified email via SMTP.
func sendOTPEmail(to, otp string) error {
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "madhavbhayani21@gmail.com"
	}
	password := os.Getenv("SMTP_PASSWORD")
	smtpHost := os.Getenv("SMTP_HOST")
	if smtpHost == "" {
		smtpHost = "smtp.gmail.com"
	}
	smtpPort := os.Getenv("SMTP_PORT")
	if smtpPort == "" {
		smtpPort = "587"
	}

	if password == "" {
		return fmt.Errorf("SMTP_PASSWORD environment variable is not set")
	}

	subject := "Your ChatCraft Verification Code"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 420px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">
    <h1 style="font-size: 24px; font-weight: 800; color: #0C0A0A; margin: 0 0 8px 0;">
      Chat<span style="color: #DC2626;">Craft</span>
    </h1>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 32px 0;">Email Verification</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      Use the code below to verify your email address. This code expires in <strong>10 minutes</strong>.
    </p>
    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0C0A0A;">%s</span>
    </div>
    <p style="color: #9CA3AF; font-size: 13px; line-height: 1.5; margin: 0;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`, otp)

	headers := fmt.Sprintf("From: ChatCraft <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n",
		from, to, subject)

	smtpAuth := smtp.PlainAuth("", from, password, smtpHost)
	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)

	return smtp.SendMail(addr, smtpAuth, from, []string{to}, []byte(headers+body))
}

// --- Account Management Endpoints ---

// LinkGoogleRequest is the JSON body for POST /api/v1/account/link-google.
type LinkGoogleRequest struct {
	IDToken string `json:"id_token"`
}

// LinkGoogle links a Google account to an existing email/password user.
func (h *GoogleHandler) LinkGoogle(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req LinkGoogleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := r.Context()

	// Verify the Firebase ID token
	var googleID string
	if h.fireClient != nil {
		token, err := h.fireClient.VerifyIDToken(ctx, req.IDToken)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid Google token")
			return
		}
		googleID = token.UID
	} else {
		claims, err := decodeJWTPayload(req.IDToken)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid token format")
			return
		}
		googleID, _ = claims["sub"].(string)
	}

	if googleID == "" {
		writeError(w, http.StatusBadRequest, "Could not extract Google account info")
		return
	}

	// Check if google_id is already used by another user
	var existingUserID string
	err := h.DB.Pool.QueryRow(ctx,
		`SELECT id FROM users WHERE google_id = $1 AND id != $2`, googleID, userID,
	).Scan(&existingUserID)
	if err == nil {
		writeError(w, http.StatusConflict, "This Google account is already linked to another user")
		return
	}

	// Link the Google account
	_, err = h.DB.Pool.Exec(ctx,
		`UPDATE users SET google_id = $1, auth_method = 'both', email_verified = true, updated_at = $2 WHERE id = $3`,
		googleID, time.Now(), userID,
	)
	if err != nil {
		log.Printf("[account] link google error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to link Google account")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Google account linked successfully"})
}

// SetupPasswordRequest is the JSON body for POST /api/v1/account/setup-password.
type SetupPasswordRequest struct {
	Password string `json:"password"`
}

// SetupPassword sets a password for a Google-only user.
func (h *GoogleHandler) SetupPassword(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req SetupPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[account] bcrypt error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to process password")
		return
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET password_hash = $1,
		 auth_method = CASE WHEN google_id IS NOT NULL THEN 'both' ELSE 'email' END,
		 updated_at = $2 WHERE id = $3`,
		string(hash), time.Now(), userID,
	)
	if err != nil {
		log.Printf("[account] setup password error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to set password")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password set successfully"})
}

// ChangeEmailRequest is the JSON body for POST /api/v1/account/change-email.
type ChangeEmailRequest struct {
	NewEmail string `json:"new_email"`
}

// ChangeEmail initiates an email change by sending OTP to the new email.
func (h *GoogleHandler) ChangeEmail(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req ChangeEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.NewEmail = strings.TrimSpace(strings.ToLower(req.NewEmail))
	if req.NewEmail == "" {
		writeError(w, http.StatusBadRequest, "New email is required")
		return
	}

	// Check if email is already taken
	var existingID string
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT id FROM users WHERE email = $1 AND id != $2`, req.NewEmail, userID,
	).Scan(&existingID)
	if err == nil {
		writeError(w, http.StatusConflict, "This email is already in use")
		return
	}

	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	expiresAt := time.Now().Add(10 * time.Minute)

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = $3 WHERE id = $4`,
		otp, expiresAt, time.Now(), userID,
	)
	if err != nil {
		log.Printf("[account] change email otp error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate OTP")
		return
	}

	if err := sendOTPEmail(req.NewEmail, otp); err != nil {
		log.Printf("[account] change email send error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to send OTP email")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent to new email"})
}

// ConfirmChangeEmailRequest is the JSON body for POST /api/v1/account/confirm-email.
type ConfirmChangeEmailRequest struct {
	NewEmail string `json:"new_email"`
	OTP      string `json:"otp"`
}

// ConfirmChangeEmail verifies OTP and updates the user's email.
func (h *GoogleHandler) ConfirmChangeEmail(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req ConfirmChangeEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.NewEmail = strings.TrimSpace(strings.ToLower(req.NewEmail))
	if req.NewEmail == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "New email and OTP are required")
		return
	}

	var storedOTP *string
	var expiresAt *time.Time
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT otp_code, otp_expires_at FROM users WHERE id = $1`, userID,
	).Scan(&storedOTP, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	if storedOTP == nil || *storedOTP != req.OTP {
		writeError(w, http.StatusBadRequest, "Invalid OTP")
		return
	}
	if expiresAt == nil || time.Now().After(*expiresAt) {
		writeError(w, http.StatusBadRequest, "OTP has expired. Please request a new one.")
		return
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET email = $1, email_verified = true, otp_code = NULL, otp_expires_at = NULL, updated_at = $2 WHERE id = $3`,
		req.NewEmail, time.Now(), userID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "This email is already in use")
			return
		}
		log.Printf("[account] confirm change email error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update email")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Email changed successfully"})
}

// GetAccountInfo returns detailed account info for the account page.
func (h *GoogleHandler) GetAccountInfo(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var user model.User
	var passwordHash *string
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT id, name, email, auth_method, google_id, email_verified, password_hash, created_at, updated_at FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.Name, &user.Email, &user.AuthMethod, &user.GoogleID, &user.EmailVerified, &passwordHash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	hasPassword := passwordHash != nil && *passwordHash != ""

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":         user,
		"has_password": hasPassword,
		"has_google":   user.GoogleID != nil && *user.GoogleID != "",
	})
}

// --- Forgot Password ---

// ForgotPasswordRequest is the JSON body for POST /api/v1/auth/forgot-password.
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword sends an OTP to reset the user's password.
func (h *GoogleHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "Email is required")
		return
	}

	// Check user exists and has a password
	var userID string
	var passwordHash *string
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT id, password_hash FROM users WHERE email = $1`, req.Email,
	).Scan(&userID, &passwordHash)
	if err != nil {
		// Don't reveal whether the email exists
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "If an account with this email exists, a reset code has been sent."})
		return
	}

	if passwordHash == nil || *passwordHash == "" {
		// Google-only user — can't reset password that doesn't exist
		writeError(w, http.StatusBadRequest, "This account uses Google sign-in. Please use the Google button to log in.")
		return
	}

	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	expiresAt := time.Now().Add(10 * time.Minute)

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = $3 WHERE id = $4`,
		otp, expiresAt, time.Now(), userID,
	)
	if err != nil {
		log.Printf("[forgot-password] otp store error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate reset code")
		return
	}

	if err := sendOTPEmail(req.Email, otp); err != nil {
		log.Printf("[forgot-password] email send error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to send reset code")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "If an account with this email exists, a reset code has been sent."})
}

// ResetPasswordRequest is the JSON body for POST /api/v1/auth/reset-password.
type ResetPasswordRequest struct {
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	NewPassword string `json:"new_password"`
}

// ResetPassword verifies the OTP and sets a new password.
func (h *GoogleHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.OTP == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "Email, OTP, and new password are required")
		return
	}

	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	var storedOTP *string
	var expiresAt *time.Time
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT otp_code, otp_expires_at FROM users WHERE email = $1`, req.Email,
	).Scan(&storedOTP, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "No account found with this email")
		return
	}

	if storedOTP == nil || *storedOTP != req.OTP {
		writeError(w, http.StatusBadRequest, "Invalid reset code")
		return
	}
	if expiresAt == nil || time.Now().After(*expiresAt) {
		writeError(w, http.StatusBadRequest, "Reset code has expired. Please request a new one.")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[reset-password] bcrypt error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to process password")
		return
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`UPDATE users SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL, updated_at = $2 WHERE email = $3`,
		string(hash), time.Now(), req.Email,
	)
	if err != nil {
		log.Printf("[reset-password] update error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to reset password")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password reset successfully. You can now log in."})
}

// --- Delete Account ---

// DeleteAccount removes the user and all associated data.
func (h *GoogleHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	ctx := r.Context()

	// Delete in order: projects → bots → user (foreign keys cascade, but explicit is safer)
	_, err := h.DB.Pool.Exec(ctx, `DELETE FROM projects WHERE user_id = $1`, userID)
	if err != nil {
		log.Printf("[delete-account] projects delete error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to delete account data")
		return
	}

	_, err = h.DB.Pool.Exec(ctx, `DELETE FROM bots WHERE user_id = $1`, userID)
	if err != nil {
		log.Printf("[delete-account] bots delete error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to delete account data")
		return
	}

	result, err := h.DB.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		log.Printf("[delete-account] user delete error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to delete account")
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Account deleted successfully"})
}
