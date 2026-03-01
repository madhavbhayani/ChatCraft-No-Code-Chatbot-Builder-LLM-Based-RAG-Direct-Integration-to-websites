package handler

import (
	"encoding/json"
	"net/http"
)

// HealthHandler returns API health status.
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "chatcraft-api",
	})
}
