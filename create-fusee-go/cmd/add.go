package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"

	"github.com/spf13/cobra"
)

var includeCometFlag bool

var addCmd = &cobra.Command{
	Use:   "add [package]",
	Short: "Add an optional Fusée package to your project",
	Long: `Add an optional package to an existing Fusée project.

Available packages:
  server   — Install the Go SSR Engine (framework/engine-go)
             Enables server-side rendering via: npm run dev
  comet    — Install the Comet HTMX-like server-driven UI module
  frel     — Install FREL, the Fusée Reactive Expression Language
             (LINQ-to-Objects style queries over arrays, iterables, and signals)`,
	Args:    cobra.ExactArgs(1),
	Aliases: []string{"install", "i"},
	Run: func(cmd *cobra.Command, args []string) {
		pkg := strings.ToLower(strings.TrimSpace(args[0]))

		switch pkg {
		case "server", "go-server", "engine-go":
			runAddServer(cmd)
		case "comet", "comet-js":
			runAddComet()
		case "frel", "reactive":
			runAddFrel()
		default:
			fmt.Printf("Unknown package '%s'.\n\nAvailable packages:\n  server   — Go SSR Engine\n  comet    — Comet HTMX-like UI module\n  frel     — Reactive LINQ-to-Objects queries\n", pkg)
			os.Exit(1)
		}
	},
}

func runAddServer(cmd *cobra.Command) {
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

	includeComet := includeCometFlag
	if !cmd.Flags().Changed("comet") {
		reader := bufio.NewReader(os.Stdin)
		fmt.Printf("Include Comet (HTMX-like server-driven UI module)? [y/N] (default: none): ")
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		includeComet = cleaned == "y" || cleaned == "yes"
	}

	fmt.Println("Installing Fusée Go SSR Engine...")

	if err := assets.CopyEngineGo(destDir, includeComet); err != nil {
		fmt.Printf("Failed to install Go SSR Engine: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\nGo SSR Engine installed at framework/engine-go")
	if includeComet {
		fmt.Println("   + Comet module enabled (Go helpers + JS runtime at framework/core/comet-js)")
	}
	fmt.Println()
	fmt.Println("   Run your app with the Go server:")
	fmt.Println("     npm run dev         — generate manifest + start Go server (port 3000)")
	fmt.Println("     npm run dev:spa     — Vite SPA mode (port 5173, no Go required)")
	fmt.Println("     npm run manifest    — regenerate SSR route manifest only")
	fmt.Println()
	fmt.Println("   Requirements: Go 1.22+ must be installed (https://go.dev/dl/)")
}

func runAddComet() {
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		fmt.Println("Error: Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	cometJSDest := filepath.Join("framework", "core", "comet-js")
	if err := assets.CopyCometJS(cometJSDest); err != nil {
		fmt.Printf("Failed to install Comet JS: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Comet JS client runtime installed at %s\n", cometJSDest)

	engineGoDir := filepath.Join("framework", "engine-go")
	if _, err := os.Stat(engineGoDir); err == nil {
		cometGoDest := filepath.Join(engineGoDir, "comet")
		if err := assets.CopyCometGo(cometGoDest); err == nil {
			fmt.Printf("Comet Go helpers installed at %s\n", cometGoDest)
		}
	}
}

func runAddFrel() {
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		fmt.Println("Error: Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	destDir := filepath.Join("framework", "frel")

	if _, err := os.Stat(destDir); err == nil {
		fmt.Printf("FREL is already installed at %s\n", destDir)
		fmt.Println("   To reinstall, remove the directory first and run again.")
		os.Exit(0)
	}

	fmt.Println("Installing FREL (Fusée Reactive Expression Language)...")

	if err := assets.CopyFrelJS(destDir); err != nil {
		fmt.Printf("Failed to install FREL: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\nFREL installed at %s\n", destDir)
	fmt.Println(`   import { from } from "./framework/frel/frel.js"`)
}

func init() {
	addCmd.Flags().BoolVarP(&includeCometFlag, "comet", "c", false, "Include optional Comet HTMX-like module")
	rootCmd.AddCommand(addCmd)
}
