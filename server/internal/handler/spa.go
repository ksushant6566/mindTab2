package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// SPAHandler serves a Single Page Application from a directory.
// - Requests for files that exist (JS, CSS, images) are served directly with appropriate cache headers
// - All other requests get index.html (SPA client-side routing)
type SPAHandler struct {
	staticDir string // path to Vite build output (e.g., "./static" or "/app/static")
}

func NewSPAHandler(staticDir string) *SPAHandler {
	return &SPAHandler{staticDir: staticDir}
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Build the file path
	path := filepath.Join(h.staticDir, r.URL.Path)

	// Check if the file exists
	_, err := os.Stat(path)
	if os.IsNotExist(err) || err != nil {
		// File doesn't exist — serve index.html (SPA fallback)
		http.ServeFile(w, r, filepath.Join(h.staticDir, "index.html"))
		return
	}

	// File exists — serve it with cache headers for hashed assets
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}

	http.FileServer(http.Dir(h.staticDir)).ServeHTTP(w, r)
}
