package engine

import (
	"encoding/json"
	"fmt"
	"os"

	"fusee/rustast"
)

type ManifestRoute struct {
	Pattern  string        `json:"pattern"`
	FilePath string        `json:"filePath"`
	Title    string        `json:"title"`
	AST      *rustast.Node `json:"ast"`
}

type Manifest struct {
	Version string           `json:"version"`
	Routes  []*ManifestRoute `json:"routes"`
}

func LoadManifest(manifestPath string) (*Manifest, error) {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest: %w", err)
	}

	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to unmarshal manifest: %w", err)
	}

	return &manifest, nil
}
