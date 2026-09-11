package engine

import (
	"compress/gzip"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var hashedAssetRE = regexp.MustCompile(`[.\-][a-f0-9]{8,}\.[a-zA-Z0-9]+$`)

var mimeTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".mjs":   "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".json":  "application/json; charset=utf-8",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".gif":   "image/gif",
	".webp":  "image/webp",
	".ico":   "image/x-icon",
	".woff":  "font/woff",
	".woff2": "font/woff2",
	".txt":   "text/plain; charset=utf-8",
	".map":   "application/json; charset=utf-8",
	".wasm":  "application/wasm",
}

func contentTypeFor(path string) string {
	if ct, ok := mimeTypes[strings.ToLower(filepath.Ext(path))]; ok {
		return ct
	}
	return "application/octet-stream"
}

func cacheControlFor(path string) string {
	if hashedAssetRE.MatchString(path) {
		return "public, max-age=31536000, immutable"
	}
	return "public, max-age=0, must-revalidate"
}

func pickEncoding(acceptEncoding string) string {
	lower := strings.ToLower(acceptEncoding)
	if strings.Contains(lower, "br") {
		return "br"
	}
	if strings.Contains(lower, "gzip") {
		return "gzip"
	}
	return ""
}

func Resolve(distDir, pathname string) (path string, ok bool) {
	if idx := strings.IndexByte(pathname, '?'); idx != -1 {
		pathname = pathname[:idx]
	}

	resolvedRoot, err := filepath.Abs(distDir)
	if err != nil {
		return "", false
	}
	candidate := filepath.Join(resolvedRoot, filepath.Clean("/"+pathname))
	if candidate != resolvedRoot && !strings.HasPrefix(candidate, resolvedRoot+string(filepath.Separator)) {
		return "", false
	}

	info, err := os.Stat(candidate)
	if err != nil || info.IsDir() {
		return "", false
	}
	return candidate, true
}

func Serve(w http.ResponseWriter, r *http.Request, filePath string) error {
	encoding := pickEncoding(r.Header.Get("Accept-Encoding"))
	contentType := contentTypeFor(filePath)
	cacheControl := cacheControlFor(filePath)

	if encoding != "" {
		ext := ".gz"
		if encoding == "br" {
			ext = ".br"
		}
		if f, err := os.Open(filePath + ext); err == nil {
			defer f.Close()
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", cacheControl)
			w.Header().Set("Content-Encoding", encoding)
			w.Header().Set("Vary", "Accept-Encoding")
			w.WriteHeader(http.StatusOK)
			_, err := io.Copy(w, f)
			return err
		}
	}

	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cacheControl)

	if encoding == "gzip" {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")
		w.WriteHeader(http.StatusOK)
		gz := gzip.NewWriter(w)
		defer gz.Close()
		_, err := io.Copy(gz, f)
		return err
	}

	w.WriteHeader(http.StatusOK)
	_, err = io.Copy(w, f)
	return err
}
