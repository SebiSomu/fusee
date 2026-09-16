package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"
	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add [package]",
	Short: "Add an optional Fusée package to your project",
	Long: `Add an optional package to an existing Fusée project.

Available packages:
  server   — Install the Go SSR Engine (framework/engine-go)
             Enables server-side rendering via: npm run dev`,
	Args:    cobra.ExactArgs(1),
	Aliases: []string{"install", "i"},
	Run: func(cmd *cobra.Command, args []string) {
		pkg := strings.ToLower(strings.TrimSpace(args[0]))

		switch pkg {
		case "server", "go-server", "engine-go":
			runAddServer()
		default:
			fmt.Printf("Unknown package '%s'.\n\nAvailable packages:\n  server   — Go SSR Engine\n", pkg)
			os.Exit(1)
		}
	},
}

func runAddServer() {
	// Must be run from inside a Fusée project
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		fmt.Println("Error: Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	destDir := filepath.Join("framework", "engine-go")

	if _, err := os.Stat(destDir); err == nil {
		fmt.Printf("Go SSR Engine already installed at %s\n", destDir)
		fmt.Println("   To reinstall, remove the directory first and run again.")
		os.Exit(0)
	}

	fmt.Println("Installing Fusée Go SSR Engine...")

	if err := assets.CopyEngineGo(destDir); err != nil {
		fmt.Printf("Failed to install Go SSR Engine: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\nGo SSR Engine installed at framework/engine-go")
	fmt.Println()
	fmt.Println("   Run your app with the Go server:")
	fmt.Println("     npm run dev         — generate manifest + start Go server (port 3000)")
	fmt.Println("     npm run dev:spa     — Vite SPA mode (port 5173, no Go required)")
	fmt.Println("     npm run manifest    — regenerate SSR route manifest only")
	fmt.Println()
	fmt.Println("   Requirements: Go 1.22+ must be installed (https://go.dev/dl/)")
}

func init() {
	rootCmd.AddCommand(addCmd)
}
