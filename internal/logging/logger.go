package logging

import (
	"log/slog"
	"os"
	"strings"
	"sync"
)

var (
	once   sync.Once
	logger *slog.Logger
)

func getLogger() *slog.Logger {
	once.Do(func() {
		handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: parseLevel(os.Getenv("LOG_LEVEL")),
		})
		logger = slog.New(handler)
	})
	return logger
}

func parseLevel(v string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Debug writes a debug-level message.
func Debug(msg string, args ...any) {
	getLogger().Debug(msg, args...)
}

// Info writes an info-level message.
func Info(msg string, args ...any) {
	getLogger().Info(msg, args...)
}

// Warn writes a warn-level message.
func Warn(msg string, args ...any) {
	getLogger().Warn(msg, args...)
}

// Error writes an error-level message.
func Error(msg string, args ...any) {
	getLogger().Error(msg, args...)
}
