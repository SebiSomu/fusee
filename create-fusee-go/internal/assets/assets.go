package assets

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

//go:embed all:templates all:embed/framework
var EmbeddedFiles embed.FS

type Config struct {
	ProjectName string
	IsTS        bool
	Ext         string
	BtnStyle    string
}

func CopyEmbeddedDir(srcDir, destDir string, keepTypes bool) error {
	return fs.WalkDir(EmbeddedFiles, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath := strings.TrimPrefix(path, srcDir)
		relPath = strings.TrimPrefix(relPath, "/")

		if relPath == "" {
			return nil
		}

		if !keepTypes && (strings.HasSuffix(relPath, ".d.ts") || strings.HasPrefix(relPath, "types")) {
			return nil
		}

		parts := strings.Split(relPath, "/")
		for _, part := range parts {
			if part == "bin" || part == "node_modules" || part == ".git" || part == "dist" || part == "__tests__" {
				return nil
			}
		}

		destPath := filepath.Join(destDir, filepath.FromSlash(relPath))

		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		data, err := EmbeddedFiles.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	})
}

func WriteTemplate(tmplPath, destPath string, config Config) error {
	data, err := EmbeddedFiles.ReadFile(tmplPath)
	if err != nil {
		return err
	}

	tmpl, err := template.New(tmplPath).Parse(string(data))
	if err != nil {
		return err
	}

	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()

	return tmpl.Execute(f, config)
}
