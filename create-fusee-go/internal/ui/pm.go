package ui

import (
	"os"
	"os/exec"
	"strings"
)

type PackageManager struct {
	Name        string
	InstallCmd  string
	InstallArgs []string
	RunDevCmd   string
	RunSSRCmd   string
	Color       string
}

var supportedPMs = map[string]PackageManager{
	"npm": {
		Name:        "npm",
		InstallCmd:  "npm",
		InstallArgs: []string{"install"},
		RunDevCmd:   "npm run dev:spa",
		RunSSRCmd:   "npm run dev",
		Color:       BoldRed,
	},
	"pnpm": {
		Name:        "pnpm",
		InstallCmd:  "pnpm",
		InstallArgs: []string{"install"},
		RunDevCmd:   "pnpm dev:spa",
		RunSSRCmd:   "pnpm dev",
		Color:       BoldYellow,
	},
	"yarn": {
		Name:        "yarn",
		InstallCmd:  "yarn",
		InstallArgs: []string{"install"},
		RunDevCmd:   "yarn dev:spa",
		RunSSRCmd:   "yarn dev",
		Color:       BoldHiBlue,
	},
	"bun": {
		Name:        "bun",
		InstallCmd:  "bun",
		InstallArgs: []string{"install"},
		RunDevCmd:   "bun dev:spa",
		RunSSRCmd:   "bun dev",
		Color:       BoldHiYellow,
	},
	"deno": {
		Name:        "deno",
		InstallCmd:  "deno",
		InstallArgs: []string{"install"},
		RunDevCmd:   "deno task dev:spa",
		RunSSRCmd:   "deno task dev",
		Color:       BoldHiCyan,
	},
}

// DetectPackageManager returns the active or preferred package manager
func DetectPackageManager(preferred string) PackageManager {
	if preferred != "" {
		p := strings.ToLower(strings.TrimSpace(preferred))
		if pm, ok := supportedPMs[p]; ok {
			return pm
		}
	}

	ua := os.Getenv("npm_config_user_agent")
	switch {
	case strings.Contains(ua, "pnpm"):
		return supportedPMs["pnpm"]
	case strings.Contains(ua, "bun"):
		return supportedPMs["bun"]
	case strings.Contains(ua, "deno"):
		return supportedPMs["deno"]
	case strings.Contains(ua, "yarn"):
		return supportedPMs["yarn"]
	case strings.Contains(ua, "npm"):
		return supportedPMs["npm"]
	}

	// Check available binaries in PATH
	for _, name := range []string{"pnpm", "bun", "deno", "yarn"} {
		if _, err := exec.LookPath(name); err == nil {
			// If pnpm/bun is found, default can still be npm unless user asks, or we can use it
		}
	}

	return supportedPMs["npm"]
}
