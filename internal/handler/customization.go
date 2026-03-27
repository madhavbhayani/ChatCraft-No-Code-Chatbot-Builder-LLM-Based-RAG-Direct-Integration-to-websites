package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/internal/database"

	_ "image/jpeg"

	"github.com/jackc/pgx/v5"
	_ "golang.org/x/image/webp"
)

const (
	maxCustomizationIconBytes = 250 * 1024
	imagekitUploadEndpoint    = "https://upload.imagekit.io/api/v1/files/upload"
)

var (
	hexColorPattern = regexp.MustCompile(`^#([0-9A-Fa-f]{6})$`)
	rgbColorPattern = regexp.MustCompile(`^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$`)
)

type imagekitUploadResponse struct {
	FileID       string `json:"fileId"`
	Name         string `json:"name"`
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnailUrl"`
	FileType     string `json:"fileType"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
}

func verifyProjectOwnership(ctx context.Context, db *database.DB, projectID, userID string) error {
	var ownerID string
	err := db.Pool.QueryRow(ctx,
		"SELECT user_id FROM projects WHERE id = $1", projectID,
	).Scan(&ownerID)
	if err != nil {
		return fmt.Errorf("project lookup failed: %w", err)
	}
	if ownerID != userID {
		return fmt.Errorf("not owner")
	}
	return nil
}

func validateThemeColor(input string) bool {
	trimmed := strings.TrimSpace(input)
	if hexColorPattern.MatchString(trimmed) {
		return true
	}
	if !rgbColorPattern.MatchString(trimmed) {
		return false
	}
	parts := strings.Split(trimmed, ",")
	if len(parts) != 3 {
		return false
	}
	for _, p := range parts {
		var v int
		if _, err := fmt.Sscanf(strings.TrimSpace(p), "%d", &v); err != nil {
			return false
		}
		if v < 0 || v > 255 {
			return false
		}
	}
	return true
}

func sanitizeSVG(raw []byte) ([]byte, error) {
	txt := strings.ToLower(string(raw))
	for _, needle := range []string{"<script", "javascript:", "onload=", "onerror=", "<iframe", "<object", "<embed", "<foreignobject"} {
		if strings.Contains(txt, needle) {
			return nil, fmt.Errorf("svg contains disallowed content")
		}
	}
	return raw, nil
}

func verifyAndSanitizeIcon(file multipart.File, header *multipart.FileHeader) ([]byte, string, string, error) {
	defer file.Close()

	if header.Size > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("icon exceeds 250KB limit")
	}

	raw, err := io.ReadAll(io.LimitReader(file, maxCustomizationIconBytes+1))
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to read icon: %w", err)
	}
	if len(raw) == 0 {
		return nil, "", "", fmt.Errorf("empty icon file")
	}
	if len(raw) > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("icon exceeds 250KB limit")
	}

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
	allowedExt := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "svg": true}
	if !allowedExt[ext] {
		return nil, "", "", fmt.Errorf("unsupported icon format")
	}

	if ext == "svg" {
		sanitized, svgErr := sanitizeSVG(raw)
		if svgErr != nil {
			return nil, "", "", svgErr
		}
		return sanitized, "image/svg+xml", "svg", nil
	}

	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", "", fmt.Errorf("invalid image content")
	}
	if format != "jpeg" && format != "png" && format != "webp" {
		return nil, "", "", fmt.Errorf("unsupported image content")
	}

	// Re-encode raster images to PNG to strip unwanted binary payload/metadata.
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, "", "", fmt.Errorf("failed to sanitize image")
	}
	if out.Len() > maxCustomizationIconBytes {
		return nil, "", "", fmt.Errorf("sanitized icon exceeds 250KB limit")
	}

	return out.Bytes(), "image/png", "png", nil
}

func uploadIconToImageKit(iconBytes []byte, contentType, filename string) (*imagekitUploadResponse, error) {
	privateKey := strings.TrimSpace(os.Getenv("IMAGEKIT_PRIVATE_KEY"))
	if privateKey == "" {
		return nil, fmt.Errorf("IMAGEKIT_PRIVATE_KEY is not set")
	}

	folder := strings.TrimSpace(os.Getenv("IMAGEKIT_UPLOAD_FOLDER"))
	if folder == "" {
		folder = "/chatcraft/customization"
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create multipart file: %w", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(iconBytes)); err != nil {
		return nil, fmt.Errorf("failed to write file content: %w", err)
	}

	if err := writer.WriteField("fileName", filename); err != nil {
		return nil, err
	}
	if err := writer.WriteField("useUniqueFileName", "true"); err != nil {
		return nil, err
	}
	if err := writer.WriteField("folder", folder); err != nil {
		return nil, err
	}
	if err := writer.WriteField("isPublished", "true"); err != nil {
		return nil, err
	}
	if err := writer.WriteField("tags", "chatcraft,customization,icon"); err != nil {
		return nil, err
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, imagekitUploadEndpoint, body)
	if err != nil {
		return nil, fmt.Errorf("failed to build imagekit request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	encoded := base64.StdEncoding.EncodeToString([]byte(privateKey + ":"))
	req.Header.Set("Authorization", "Basic "+encoded)
	req.Header.Set("X-Content-Type", contentType)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("imagekit upload failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read imagekit response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("imagekit upload error: status %d body %s", resp.StatusCode, string(respBytes))
	}

	var out imagekitUploadResponse
	if err := json.Unmarshal(respBytes, &out); err != nil {
		return nil, fmt.Errorf("invalid imagekit response: %w", err)
	}
	if strings.TrimSpace(out.URL) == "" {
		return nil, fmt.Errorf("imagekit response missing url")
	}

	return &out, nil
}

// SaveBotCustomization validates customization payload and persists it.
// If icon_file is present, the icon is verified and uploaded server-side to ImageKit.
func (h *BotBuilderHandler) SaveBotCustomization(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(2 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart payload")
		return
	}

	themeColor := strings.TrimSpace(r.FormValue("theme_color"))
	fontFamily := strings.TrimSpace(r.FormValue("font_family"))
	iconSource := strings.TrimSpace(r.FormValue("icon_source"))
	selectedIconURL := strings.TrimSpace(r.FormValue("selected_icon_url"))
	chatbotName := ""
	chatbotNameProvided := false
	if vals, ok := r.MultipartForm.Value["chatbot_name"]; ok && len(vals) > 0 {
		chatbotNameProvided = true
		chatbotName = strings.TrimSpace(vals[0])
		if len(chatbotName) > 120 {
			writeError(w, http.StatusBadRequest, "Chatbot name must be 120 characters or fewer")
			return
		}
	}

	if themeColor == "" || !validateThemeColor(themeColor) {
		writeError(w, http.StatusBadRequest, "Invalid theme color")
		return
	}
	if fontFamily == "" {
		fontFamily = "Roboto"
	}
	if iconSource == "" {
		iconSource = "none"
	}
	switch iconSource {
	case "none", "predefined", "uploaded":
	default:
		writeError(w, http.StatusBadRequest, "Invalid icon source")
		return
	}

	iconURL := ""
	if iconSource == "predefined" {
		iconURL = selectedIconURL
		if iconURL == "" {
			writeError(w, http.StatusBadRequest, "Predefined icon URL missing")
			return
		}
	}
	file, header, err := r.FormFile("icon_file")
	if err == nil {
		iconBytes, contentType, extension, verifyErr := verifyAndSanitizeIcon(file, header)
		if verifyErr != nil {
			writeError(w, http.StatusBadRequest, "Icon verification failed: "+verifyErr.Error())
			return
		}

		uploadName := fmt.Sprintf("project-%s-icon-%d.%s", projectID, time.Now().Unix(), extension)
		uploadResp, uploadErr := uploadIconToImageKit(iconBytes, contentType, uploadName)
		if uploadErr != nil {
			log.Printf("[customization] ImageKit upload failed: %v", uploadErr)
			writeError(w, http.StatusBadGateway, "Failed to upload icon")
			return
		}
		iconURL = uploadResp.URL
		iconSource = "uploaded"
	} else if err != http.ErrMissingFile {
		writeError(w, http.StatusBadRequest, "Invalid icon upload payload")
		return
	}

	if iconSource == "uploaded" && iconURL == "" {
		// Preserve already-uploaded icon when user updates only color/font.
		var existingURL string
		fetchErr := h.DB.Pool.QueryRow(r.Context(),
			`SELECT COALESCE(icon_url, '') FROM bot_customizations WHERE project_id = $1`,
			projectID,
		).Scan(&existingURL)
		if fetchErr == nil && strings.TrimSpace(existingURL) != "" {
			iconURL = strings.TrimSpace(existingURL)
		} else if fetchErr == pgx.ErrNoRows {
			if selectedIconURL != "" {
				iconURL = selectedIconURL
			}
		} else if fetchErr != nil {
			log.Printf("[customization] failed to resolve existing uploaded icon: %v", fetchErr)
			writeError(w, http.StatusInternalServerError, "Failed to resolve uploaded icon")
			return
		}

		if iconURL == "" {
			writeError(w, http.StatusBadRequest, "Uploaded icon URL missing")
			return
		}
	}

	if iconSource == "none" {
		iconURL = ""
	}

	if chatbotNameProvided {
		_, nameErr := h.DB.Pool.Exec(r.Context(),
			`UPDATE projects
			 SET bot_name = $1,
			     updated_at = NOW()
			 WHERE id = $2`,
			chatbotName, projectID,
		)
		if nameErr != nil {
			log.Printf("[customization] failed to update chatbot name: %v", nameErr)
			writeError(w, http.StatusInternalServerError, "Failed to save chatbot name")
			return
		}
	}

	_, execErr := h.DB.Pool.Exec(r.Context(),
		`INSERT INTO bot_customizations (project_id, icon_url, theme_color, font_family, icon_source, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (project_id)
		 DO UPDATE SET icon_url = EXCLUDED.icon_url,
		               theme_color = EXCLUDED.theme_color,
		               font_family = EXCLUDED.font_family,
		               icon_source = EXCLUDED.icon_source,
		               updated_at = NOW()`,
		projectID, iconURL, themeColor, fontFamily, iconSource,
	)
	if execErr != nil {
		log.Printf("[customization] DB upsert failed: %v", execErr)
		writeError(w, http.StatusInternalServerError, "Failed to save customization")
		return
	}

	if !chatbotNameProvided {
		_ = h.DB.Pool.QueryRow(r.Context(),
			`SELECT COALESCE(bot_name, '')
			 FROM projects
			 WHERE id = $1`,
			projectID,
		).Scan(&chatbotName)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":         "Customization saved successfully",
		"project_id":      projectID,
		"icon_url":        iconURL,
		"theme_color":     themeColor,
		"font_family":     fontFamily,
		"icon_source":     iconSource,
		"chatbot_name":    chatbotName,
		"uploaded_to_cdn": iconSource == "uploaded",
	})
}

// GetBotCustomization returns persisted customization settings for a project.
func (h *BotBuilderHandler) GetBotCustomization(w http.ResponseWriter, r *http.Request) {
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

	var iconURL, themeColor, fontFamily, iconSource, chatbotName string
	if err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(bot_name, '')
		 FROM projects
		 WHERE id = $1`,
		projectID,
	).Scan(&chatbotName); err != nil {
		log.Printf("[customization] failed to fetch chatbot name: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to fetch customization")
		return
	}

	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT icon_url, theme_color, font_family, icon_source
		 FROM bot_customizations
		 WHERE project_id = $1`,
		projectID,
	).Scan(&iconURL, &themeColor, &fontFamily, &iconSource)
	if err != nil {
		if err != pgx.ErrNoRows {
			log.Printf("[customization] failed to fetch settings: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to fetch customization")
			return
		}
		// Return defaults when customization has not been saved yet.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"project_id":   projectID,
			"icon_url":     "",
			"theme_color":  "#DC2626",
			"font_family":  "Roboto",
			"icon_source":  "none",
			"chatbot_name": chatbotName,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":   projectID,
		"icon_url":     iconURL,
		"theme_color":  themeColor,
		"font_family":  fontFamily,
		"icon_source":  iconSource,
		"chatbot_name": chatbotName,
	})
}
