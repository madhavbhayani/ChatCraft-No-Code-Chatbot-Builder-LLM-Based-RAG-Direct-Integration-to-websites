package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type deployRequest struct {
	Deployed *bool                  `json:"deployed"`
	Settings map[string]interface{} `json:"settings"`
}

type analyticsSessionSummary struct {
	SessionID        string    `json:"session_id"`
	Title            string    `json:"title"`
	StartedAt        time.Time `json:"started_at"`
	LastActivityAt   time.Time `json:"last_activity_at"`
	MessageCount     int       `json:"message_count"`
	AvgConfidence    float64   `json:"avg_confidence"`
	FallbackMessages int       `json:"fallback_messages"`
}

type analyticsConversationEntry struct {
	UserMessage string    `json:"user_message"`
	BotAnswer   string    `json:"bot_answer"`
	Confidence  float64   `json:"confidence"`
	Fallback    bool      `json:"fallback"`
	CreatedAt   time.Time `json:"created_at"`
}

// GetProjectAnalytics returns pre-computed analytics data for a project.
// Analytics are real-time and refreshed directly from conversations on each request.
func (h *BotBuilderHandler) GetProjectAnalytics(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if err := verifyProjectOwnership(r.Context(), h.DB, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	if r.Body != nil {
		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&map[string]interface{}{}); err != nil && !errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}

	err := h.recomputeProjectAnalytics(r.Context(), projectID, time.Now())
	if err != nil {
		log.Printf("[analytics] realtime recompute failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to compute realtime analytics")
		return
	}

	var (
		totalSessions, totalMessages, fallbackMessages, nonFallbackMessages int
		avgConfidence, avgMessagesPerSession                                float64
		dateWiseJSON, messagesPerSessionJSON, confidencePerSessionJSON      string
		sessionsJSON, sessionConversationsJSON                              string
		lastCalculatedAt                                                    *time.Time
	)

	err = h.DB.Pool.QueryRow(r.Context(),
		`SELECT total_sessions, total_messages, fallback_messages, non_fallback_messages,
		        avg_confidence, avg_messages_per_session,
		        COALESCE(date_wise_sessions::text, '[]'),
		        COALESCE(messages_per_session::text, '[]'),
		        COALESCE(confidence_per_session::text, '[]'),
		        COALESCE(latest_sessions::text, '[]'),
		        COALESCE(session_conversations::text, '{}'),
		        last_calculated_at
		 FROM project_analytics_stats
		 WHERE project_id = $1`,
		projectID,
	).Scan(
		&totalSessions,
		&totalMessages,
		&fallbackMessages,
		&nonFallbackMessages,
		&avgConfidence,
		&avgMessagesPerSession,
		&dateWiseJSON,
		&messagesPerSessionJSON,
		&confidencePerSessionJSON,
		&sessionsJSON,
		&sessionConversationsJSON,
		&lastCalculatedAt,
	)
	if err != nil {
		if err != pgx.ErrNoRows {
			log.Printf("[analytics] stats fetch failed: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to fetch analytics")
			return
		}
		dateWiseJSON = "[]"
		messagesPerSessionJSON = "[]"
		confidencePerSessionJSON = "[]"
		sessionsJSON = "[]"
		sessionConversationsJSON = "{}"
	}

	dateWise := make([]map[string]interface{}, 0)
	messagesPerSession := make([]map[string]interface{}, 0)
	confidencePerSession := make([]map[string]interface{}, 0)
	sessions := make([]map[string]interface{}, 0)
	sessionConversations := map[string][]map[string]interface{}{}

	_ = json.Unmarshal([]byte(dateWiseJSON), &dateWise)
	_ = json.Unmarshal([]byte(messagesPerSessionJSON), &messagesPerSession)
	_ = json.Unmarshal([]byte(confidencePerSessionJSON), &confidencePerSession)
	_ = json.Unmarshal([]byte(sessionsJSON), &sessions)
	_ = json.Unmarshal([]byte(sessionConversationsJSON), &sessionConversations)

	if dateWise == nil {
		dateWise = []map[string]interface{}{}
	}
	if messagesPerSession == nil {
		messagesPerSession = []map[string]interface{}{}
	}
	if confidencePerSession == nil {
		confidencePerSession = []map[string]interface{}{}
	}
	if sessions == nil {
		sessions = []map[string]interface{}{}
	}
	if sessionConversations == nil {
		sessionConversations = map[string][]map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id": projectID,
		"main_stats": map[string]interface{}{
			"total_sessions":        totalSessions,
			"average_confidence":    avgConfidence,
			"total_messages":        totalMessages,
			"fallback_messages":     fallbackMessages,
			"non_fallback_messages": nonFallbackMessages,
		},
		"sub_stats": map[string]interface{}{
			"date_wise_sessions":           dateWise,
			"messages_per_session":         messagesPerSession,
			"confidence_per_session":       confidencePerSession,
			"average_messages_per_session": avgMessagesPerSession,
		},
		"sessions":              sessions,
		"session_conversations": sessionConversations,
		"last_calculated_at":    lastCalculatedAt,
		"message":               "Realtime analytics updated from latest conversations.",
	})
}

func (h *BotBuilderHandler) recomputeProjectAnalytics(ctx context.Context, projectID string, now time.Time) error {
	tx, err := h.DB.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	var (
		totalSessions, totalMessages, fallbackMessages int
		avgConfidence                                  float64
	)

	err = tx.QueryRow(ctx,
		`SELECT
		  COALESCE(COUNT(DISTINCT session_id), 0) AS total_sessions,
		  COALESCE(AVG(confidence), 0) AS avg_confidence,
		  COALESCE(COUNT(*), 0) AS total_messages,
		  COALESCE(SUM(CASE WHEN fallback THEN 1 ELSE 0 END), 0) AS fallback_messages
		 FROM conversations
		 WHERE project_id = $1`,
		projectID,
	).Scan(&totalSessions, &avgConfidence, &totalMessages, &fallbackMessages)
	if err != nil {
		return err
	}

	nonFallbackMessages := totalMessages - fallbackMessages
	if nonFallbackMessages < 0 {
		nonFallbackMessages = 0
	}

	sessionRows, err := tx.Query(ctx,
		`WITH session_stats AS (
		   SELECT
		     session_id,
		     MIN(created_at) AS started_at,
		     MAX(created_at) AS last_activity_at,
		     COUNT(*)::INT AS message_count,
		     COALESCE(AVG(confidence), 0)::FLOAT8 AS avg_confidence,
		     COALESCE(SUM(CASE WHEN fallback THEN 1 ELSE 0 END), 0)::INT AS fallback_messages
		   FROM conversations
		   WHERE project_id = $1
		   GROUP BY session_id
		 ),
		 latest_sessions AS (
		   SELECT *
		   FROM session_stats
		   ORDER BY last_activity_at DESC
		   LIMIT 10
		 )
		 SELECT
		   ls.session_id,
		   ls.started_at,
		   ls.last_activity_at,
		   ls.message_count,
		   ls.avg_confidence,
		   ls.fallback_messages,
		   COALESCE(first_q.user_message, '') AS first_question
		 FROM latest_sessions ls
		 LEFT JOIN LATERAL (
		   SELECT user_message
		   FROM conversations c2
		   WHERE c2.project_id = $1 AND c2.session_id = ls.session_id
		   ORDER BY c2.created_at ASC
		   LIMIT 1
		 ) first_q ON true
		 ORDER BY ls.last_activity_at DESC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer sessionRows.Close()

	latestSessions := make([]analyticsSessionSummary, 0, 10)
	dateWiseCounts := map[string]int{}
	messagesPerSession := make([]map[string]interface{}, 0, 10)
	confidencePerSession := make([]map[string]interface{}, 0, 10)
	avgMessagesPerSession := 0.0

	for sessionRows.Next() {
		var (
			sessionID, firstQuestion string
			startedAt, lastActivity  time.Time
			messageCount             int
			sessionAvgConfidence     float64
			sessionFallbacks         int
		)
		if err := sessionRows.Scan(&sessionID, &startedAt, &lastActivity, &messageCount, &sessionAvgConfidence, &sessionFallbacks, &firstQuestion); err != nil {
			continue
		}

		title := truncateAnalyticsTitle(firstQuestion)
		latestSessions = append(latestSessions, analyticsSessionSummary{
			SessionID:        sessionID,
			Title:            title,
			StartedAt:        startedAt,
			LastActivityAt:   lastActivity,
			MessageCount:     messageCount,
			AvgConfidence:    sessionAvgConfidence,
			FallbackMessages: sessionFallbacks,
		})

		dateKey := startedAt.Format("2006-01-02")
		dateWiseCounts[dateKey] = dateWiseCounts[dateKey] + 1

		messagesPerSession = append(messagesPerSession, map[string]interface{}{
			"session_id": sessionID,
			"label":      title,
			"value":      messageCount,
		})
		confidencePerSession = append(confidencePerSession, map[string]interface{}{
			"session_id": sessionID,
			"label":      title,
			"value":      sessionAvgConfidence,
		})
		avgMessagesPerSession += float64(messageCount)
	}

	if len(latestSessions) > 0 {
		avgMessagesPerSession = avgMessagesPerSession / float64(len(latestSessions))
	}

	dateKeys := make([]string, 0, len(dateWiseCounts))
	for k := range dateWiseCounts {
		dateKeys = append(dateKeys, k)
	}
	sort.Strings(dateKeys)
	dateWiseSessions := make([]map[string]interface{}, 0, len(dateKeys))
	for _, k := range dateKeys {
		dateWiseSessions = append(dateWiseSessions, map[string]interface{}{
			"date":  k,
			"value": dateWiseCounts[k],
		})
	}

	sessionIDs := make([]string, 0, len(latestSessions))
	for _, s := range latestSessions {
		sessionIDs = append(sessionIDs, s.SessionID)
	}

	sessionConversations := map[string][]analyticsConversationEntry{}
	if len(sessionIDs) > 0 {
		convRows, convErr := tx.Query(ctx,
			`SELECT session_id, user_message, bot_answer, COALESCE(confidence, 0), fallback, created_at
			 FROM conversations
			 WHERE project_id = $1 AND session_id = ANY($2)
			 ORDER BY session_id ASC, created_at ASC`,
			projectID, sessionIDs,
		)
		if convErr != nil {
			return convErr
		}
		defer convRows.Close()

		for convRows.Next() {
			var (
				sid, userMsg, botAnswer string
				confidence              float64
				fallback                bool
				createdAt               time.Time
			)
			if convRows.Scan(&sid, &userMsg, &botAnswer, &confidence, &fallback, &createdAt) != nil {
				continue
			}

			sessionConversations[sid] = append(sessionConversations[sid], analyticsConversationEntry{
				UserMessage: userMsg,
				BotAnswer:   botAnswer,
				Confidence:  confidence,
				Fallback:    fallback,
				CreatedAt:   createdAt,
			})
		}
	}

	dateWiseJSON, _ := json.Marshal(dateWiseSessions)
	messagesPerSessionJSON, _ := json.Marshal(messagesPerSession)
	confidencePerSessionJSON, _ := json.Marshal(confidencePerSession)
	latestSessionsJSON, _ := json.Marshal(latestSessions)
	sessionConversationsJSON, _ := json.Marshal(sessionConversations)

	_, err = tx.Exec(ctx,
		`INSERT INTO project_analytics_stats (
			project_id,
			total_sessions,
			avg_confidence,
			total_messages,
			fallback_messages,
			non_fallback_messages,
			avg_messages_per_session,
			date_wise_sessions,
			messages_per_session,
			confidence_per_session,
			latest_sessions,
			session_conversations,
			last_calculated_at,
			updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8::jsonb, $9::jsonb, $10::jsonb,
			$11::jsonb, $12::jsonb, $13, NOW()
		)
		ON CONFLICT (project_id)
		DO UPDATE SET
			total_sessions = EXCLUDED.total_sessions,
			avg_confidence = EXCLUDED.avg_confidence,
			total_messages = EXCLUDED.total_messages,
			fallback_messages = EXCLUDED.fallback_messages,
			non_fallback_messages = EXCLUDED.non_fallback_messages,
			avg_messages_per_session = EXCLUDED.avg_messages_per_session,
			date_wise_sessions = EXCLUDED.date_wise_sessions,
			messages_per_session = EXCLUDED.messages_per_session,
			confidence_per_session = EXCLUDED.confidence_per_session,
			latest_sessions = EXCLUDED.latest_sessions,
			session_conversations = EXCLUDED.session_conversations,
			last_calculated_at = EXCLUDED.last_calculated_at,
			updated_at = NOW()`,
		projectID,
		totalSessions,
		avgConfidence,
		totalMessages,
		fallbackMessages,
		nonFallbackMessages,
		avgMessagesPerSession,
		string(dateWiseJSON),
		string(messagesPerSessionJSON),
		string(confidencePerSessionJSON),
		string(latestSessionsJSON),
		string(sessionConversationsJSON),
		now,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func truncateAnalyticsTitle(question string) string {
	q := strings.TrimSpace(question)
	if q == "" {
		return "Untitled session"
	}
	if len(q) <= 80 {
		return q
	}
	return q[:80] + "..."
}

// GetDeploymentStatus returns the persisted deployment status for a project.
func (h *BotBuilderHandler) GetDeploymentStatus(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if err := verifyProjectOwnership(r.Context(), h.DB, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	deployed := false
	status := "draft"
	var deployedAt *time.Time

	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(is_deployed, false), COALESCE(status, 'draft'), deployed_at
		 FROM bots
		 WHERE project_id = $1
		 ORDER BY updated_at DESC
		 LIMIT 1`,
		projectID,
	).Scan(&deployed, &status, &deployedAt)
	if err != nil {
		if err != pgx.ErrNoRows {
			log.Printf("[deploy] status lookup failed: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to fetch deployment status")
			return
		}
		deployed = false
		status = "draft"
		deployedAt = nil
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":  projectID,
		"deployed":    deployed,
		"status":      status,
		"deployed_at": deployedAt,
	})
}

// DeployProjectBot stores deployment state for the bot associated with the project.
func (h *BotBuilderHandler) DeployProjectBot(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	projectID := r.PathValue("project_id")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if err := verifyProjectOwnership(r.Context(), h.DB, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "Not your project")
		return
	}

	var req deployRequest
	if r.Body != nil {
		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}

	deployed := true
	if req.Deployed != nil {
		deployed = *req.Deployed
	}

	settings := req.Settings
	if settings == nil {
		settings = map[string]interface{}{}
	}
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid settings payload")
		return
	}

	var projectName, projectDescription string
	err = h.DB.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(name, ''), COALESCE(description, '')
		 FROM projects
		 WHERE id = $1`,
		projectID,
	).Scan(&projectName, &projectDescription)
	if err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	status := "draft"
	var deployedAt interface{}
	if deployed {
		status = "active"
		now := time.Now()
		deployedAt = now
	}

	tx, err := h.DB.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("[deploy] tx begin failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update deployment state")
		return
	}
	defer func() {
		_ = tx.Rollback(r.Context())
	}()

	updateResult, err := tx.Exec(r.Context(),
		`UPDATE bots
		 SET user_id = $1,
		     name = $3,
		     description = $4,
		     status = $5,
		     bot_token = $6,
		     settings = $7::jsonb,
		     is_deployed = $8,
		     deployed_at = $9,
		     updated_at = NOW()
		 WHERE project_id = $2`,
		userID, projectID, projectName, projectDescription, status, projectID, string(settingsJSON), deployed, deployedAt,
	)
	if err != nil {
		log.Printf("[deploy] update failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update deployment state")
		return
	}

	if updateResult.RowsAffected() == 0 {
		_, err = tx.Exec(r.Context(),
			`INSERT INTO bots (id, user_id, project_id, name, description, status, bot_token, settings, is_deployed, deployed_at, created_at, updated_at)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW(), NOW())`,
			userID, projectID, projectName, projectDescription, status, projectID, string(settingsJSON), deployed, deployedAt,
		)
		if err != nil {
			log.Printf("[deploy] insert failed: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to update deployment state")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("[deploy] tx commit failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update deployment state")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":  projectID,
		"deployed":    deployed,
		"status":      status,
		"deployed_at": deployedAt,
	})
}
