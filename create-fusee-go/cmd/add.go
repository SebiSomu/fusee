package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"
	"create-fusee/internal/ui"

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
			ui.Error(fmt.Sprintf("Unknown package '%s'.", pkg))
			fmt.Printf("\nAvailable packages:\n  %sserver%s   — Go SSR Engine\n  %scomet%s    — Comet HTMX-like UI module\n  %sfrel%s     — Reactive LINQ-to-Objects queries\n", ui.BoldCyan, ui.Reset, ui.BoldCyan, ui.Reset, ui.BoldCyan, ui.Reset)
			os.Exit(1)
		}
	},
}

func runAddServer(cmd *cobra.Command) {
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		ui.Error("Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	destDir := filepath.Join("framework", "engine-go")

	if _, err := os.Stat(destDir); err == nil {
		ui.Info(fmt.Sprintf("Go SSR Engine already installed at %s%s%s", ui.BoldCyan, destDir, ui.Reset))
		fmt.Printf("   %sTo reinstall, remove the directory first and run again.%s\n", ui.FgGray, ui.Reset)
		os.Exit(0)
	}

	includeComet := includeCometFlag
	if !cmd.Flags().Changed("comet") {
		cometChoice := ui.Select("Include Comet module? (HTMX-like server-driven UI)", []ui.SelectOption{
			{Label: "No", Desc: "Standard Go SSR Engine", Value: "no"},
			{Label: "Yes", Desc: "Enable Comet Go helpers & JS client runtime", Value: "yes"},
		}, 0)
		includeComet = cometChoice == "yes"
	}

	ui.Info("Installing Fusée Go SSR Engine...")

	if err := assets.CopyEngineGo(destDir, includeComet); err != nil {
		ui.Error(fmt.Sprintf("Failed to install Go SSR Engine: %v", err))
		os.Exit(1)
	}

	ui.Success("Go SSR Engine installed at framework/engine-go")
	if includeComet {
		fmt.Printf("   %s+%s Comet module enabled %s(Go helpers + JS runtime)%s\n", ui.BoldGreen, ui.Reset, ui.FgGray, ui.Reset)
	}
	fmt.Println()
	fmt.Printf("%sRun your app with the Go server:%s\n", ui.BoldWhite, ui.Reset)
	fmt.Printf("  %snpm run dev%s         %s— generate manifest + start Go server (port 3000)%s\n", ui.BoldCyan, ui.Reset, ui.FgGray, ui.Reset)
	fmt.Printf("  %snpm run dev:spa%s     %s— Vite SPA mode (port 5173, no Go required)%s\n", ui.BoldCyan, ui.Reset, ui.FgGray, ui.Reset)
	fmt.Printf("  %snpm run manifest%s    %s— regenerate SSR route manifest only%s\n", ui.BoldCyan, ui.Reset, ui.FgGray, ui.Reset)
	fmt.Println()
	fmt.Printf("  %sRequirements: Go 1.22+ must be installed (https://go.dev/dl/)%s\n\n", ui.FgGray, ui.Reset)
}

func runAddComet() {
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		ui.Error("Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	cometJSDest := filepath.Join("framework", "core", "comet-js")
	if err := assets.CopyCometJS(cometJSDest); err != nil {
		ui.Error(fmt.Sprintf("Failed to install Comet JS: %v", err))
		os.Exit(1)
	}
	ui.Success(fmt.Sprintf("Comet JS client runtime installed at %s", cometJSDest))

	engineGoDir := filepath.Join("framework", "engine-go")
	if _, err := os.Stat(engineGoDir); err == nil {
		cometGoDest := filepath.Join(engineGoDir, "comet")
		if err := assets.CopyCometGo(cometGoDest); err == nil {
			ui.Success(fmt.Sprintf("Comet Go helpers installed at %s", cometGoDest))
		}
	}
}

func runAddFrel() {
	if _, err := os.Stat("framework"); os.IsNotExist(err) {
		ui.Error("Run this command from the root of a Fusée project (where framework/ lives).")
		os.Exit(1)
	}

	destDir := filepath.Join("framework", "frel")

	if _, err := os.Stat(destDir); err == nil {
		ui.Info(fmt.Sprintf("FREL is already installed at %s", destDir))
		fmt.Printf("   %sTo reinstall, remove the directory first and run again.%s\n", ui.FgGray, ui.Reset)
		os.Exit(0)
	}

	ui.Info("Installing FREL (Fusée Reactive Expression Language)...")

	if err := assets.CopyFrelJS(destDir); err != nil {
		ui.Error(fmt.Sprintf("Failed to install FREL: %v", err))
		os.Exit(1)
	}

	ui.Success(fmt.Sprintf("FREL installed at %s", destDir))
	fmt.Printf("   %simport { from } from \"./framework/frel/frel.js\"%s\n\n", ui.BoldCyan, ui.Reset)
}

func init() {
	addCmd.Flags().BoolVarP(&includeCometFlag, "comet", "c", false, "Include optional Comet HTMX-like module")
	rootCmd.AddCommand(addCmd)
}
