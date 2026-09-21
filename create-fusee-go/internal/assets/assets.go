package assets

import (
	"embed"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

//go:embed all:templates all:embed/framework
var EmbeddedFiles embed.FS

//go:embed all:embed/engine-go
var EmbeddedEngineGo embed.FS

type Config struct {
	ProjectName string
	IsTS        bool
	IsJSX       bool
	UseTailwind bool
	Ext         string
	BtnStyle    string
}

type ProjectMeta struct {
	IsTS        bool `json:"isTS"`
	IsJSX       bool `json:"isJSX"`
	UseTailwind bool `json:"useTailwind"`
}

func WriteProjectMeta(projectPath string, meta ProjectMeta) error {
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(projectPath, ".fusee", "project.json"), data, 0644)
}

func ReadProjectMeta(projectRoot string) (ProjectMeta, error) {
	data, err := os.ReadFile(filepath.Join(projectRoot, ".fusee", "project.json"))
	if err != nil {
		return ProjectMeta{}, err
	}
	var meta ProjectMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return ProjectMeta{}, err
	}
	return meta, nil
}

var jsxRuntimeFiles = map[string]bool{
	"jsx-runtime.js":             true,
	"jsx-dev-runtime.js":         true,
	"jsx-helpers.js":             true,
	"jsx-runtime.d.ts":           true,
	"jsx-dev-runtime.d.ts":       true,
	"jsx-types.d.ts":             true,
	"babel-plugin-fusee-jsx.cjs": true,
}

func CopyEmbeddedDir(srcDir, destDir string, keepTypes bool, includeJSX bool) error {
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
			if part == "bin" || part == "node_modules" || part == ".git" || part == "dist" || part == "__tests__" || part == "target" || part == ".idea" || part == ".cargo" || part == "comet-js" || part == "comet" || part == "frel" {
				return nil
			}
			if !includeJSX && part == "jsx" {
				return nil
			}
		}

		if !includeJSX && !d.IsDir() && jsxRuntimeFiles[parts[len(parts)-1]] {
			return nil
		}

		destPath := filepath.Join(destDir, filepath.FromSlash(relPath))

		if strings.HasSuffix(destPath, "go.mod.txt") {
			destPath = strings.TrimSuffix(destPath, ".txt")
		}

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

func CopyEngineGo(destDir string, includeComet bool) error {
	const srcDir = "embed/engine-go"

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	err := fs.WalkDir(EmbeddedEngineGo, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath := strings.TrimPrefix(path, srcDir)
		relPath = strings.TrimPrefix(relPath, "/")

		if relPath == "" {
			return nil
		}

		if !includeComet && (strings.HasPrefix(relPath, "comet") || strings.Contains(relPath, "/comet")) {
			return nil
		}

		destPath := filepath.Join(destDir, filepath.FromSlash(relPath))

		if strings.HasSuffix(destPath, "go.mod.txt") {
			destPath = strings.TrimSuffix(destPath, ".txt")
		}

		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		data, err := EmbeddedEngineGo.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	})
	if err != nil {
		return err
	}

	if includeComet {
		cometJSDest := filepath.Join(filepath.Dir(destDir), "core", "comet-js")
		return CopyCometJS(cometJSDest)
	}

	return nil
}

func CopyCometJS(destDir string) error {
	const srcDir = "embed/framework/core/comet-js"

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return fs.WalkDir(EmbeddedFiles, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath := strings.TrimPrefix(path, srcDir)
		relPath = strings.TrimPrefix(relPath, "/")

		if relPath == "" {
			return nil
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

func CopyCometGo(destDir string) error {
	const srcDir = "embed/engine-go/comet"

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return fs.WalkDir(EmbeddedEngineGo, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath := strings.TrimPrefix(path, srcDir)
		relPath = strings.TrimPrefix(relPath, "/")

		if relPath == "" {
			return nil
		}

		destPath := filepath.Join(destDir, filepath.FromSlash(relPath))

		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		data, err := EmbeddedEngineGo.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	})
}

func CopyFrelJS(dest string) error {
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	return CopyEmbeddedDir("embed/framework/frel", dest, true, true)
}
