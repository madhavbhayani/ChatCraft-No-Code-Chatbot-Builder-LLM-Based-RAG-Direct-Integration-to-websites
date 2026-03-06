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
)

// ProjectHandler holds dependencies for project endpoints.
type ProjectHandler struct {
	DB *database.DB
}

// NewProjectHandler creates a ProjectHandler.
func NewProjectHandler(db *database.DB) *ProjectHandler {
	return &ProjectHandler{DB: db}
}

// CreateProjectRequest is the JSON body for POST /api/v1/projects.
type CreateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// GetProject returns the project for the authenticated user.
// GET /api/v1/projects
func (h *ProjectHandler) GetProject(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var project model.Project
	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT id, user_id, name, description, status, 
		        COALESCE(website_url, ''), COALESCE(website_urls, '{}'),
		        COALESCE(bot_name, ''), 
		        COALESCE(system_prompt, ''), setup_step,
		        created_at, updated_at
		 FROM projects WHERE user_id = $1`, userID,
	).Scan(&project.ID, &project.UserID, &project.Name, &project.Description,
		&project.Status, &project.WebsiteURL, &project.WebsiteURLs, &project.BotName,
		&project.SystemPrompt, &project.SetupStep,
		&project.CreatedAt, &project.UpdatedAt)

	if err != nil {
		// No project found — return null project (not an error)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"project": nil})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"project": project})
}

// CreateProject creates a project for the authenticated user.
// Each user can have at most 1 project.
// POST /api/v1/projects
func (h *ProjectHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Project name is required")
		return
	}

	// Check if user already has a project
	var exists bool
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM projects WHERE user_id = $1)", userID,
	).Scan(&exists)
	if err != nil {
		log.Printf("[project] check error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to check existing project")
		return
	}
	if exists {
		writeError(w, http.StatusConflict, "You can only create one project. Delete the existing one first.")
		return
	}

	project := model.Project{
		ID:          uuid.New().String(),
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		Status:      "draft",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	_, err = h.DB.Pool.Exec(r.Context(),
		`INSERT INTO projects (id, user_id, name, description, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		project.ID, project.UserID, project.Name, project.Description,
		project.Status, project.CreatedAt, project.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "uq_projects_user_id") {
			writeError(w, http.StatusConflict, "You can only create one project")
			return
		}
		log.Printf("[project] insert error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create project")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"project": project})
}

// DeleteProject deletes the user's project.
// DELETE /api/v1/projects
func (h *ProjectHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	result, err := h.DB.Pool.Exec(r.Context(),
		"DELETE FROM projects WHERE user_id = $1", userID,
	)
	if err != nil {
		log.Printf("[project] delete error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to delete project")
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "No project found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Project deleted successfully"})
}
