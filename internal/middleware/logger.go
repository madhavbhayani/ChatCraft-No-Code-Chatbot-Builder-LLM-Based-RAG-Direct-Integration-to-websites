package middleware

import (
	"log"
	"net/http"
	"time"
)

// Logger logs each incoming HTTP request.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status code
		sw := &statusWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(sw, r)

		log.Printf("[%s] %s %s → %d (%s)",
			r.Method,
			r.URL.Path,
			r.RemoteAddr,
			sw.statusCode,
			time.Since(start).Round(time.Millisecond),
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	statusCode int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.statusCode = code
	sw.ResponseWriter.WriteHeader(code)
}
