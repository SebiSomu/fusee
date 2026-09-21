package cmd

import (
	"create-fusee/internal/ui"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [project-name]",
	Short: "Initialize a new Fusée project",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		ui.Banner()

		projectName := "my-fusee-app"
		if len(args) > 0 {
			projectName = args[0]
		}

		isTS, isJSX, useTailwind, initGit, pm, installDeps := resolveTemplateFlags(cmd)

		runInitWithParams(projectName, isTS, isJSX, useTailwind, initGit, pm, installDeps)
	},
}

func init() {
	initCmd.Flags().BoolVarP(&IsTSFlag, "ts", "t", false, "Use TypeScript template")
	initCmd.Flags().BoolVarP(&UseJSXFlag, "jsx", "j", false, "Use the JSX/TSX template style")
	initCmd.Flags().BoolVarP(&UseTailwindFlag, "tailwind", "w", false, "Set up Tailwind CSS")
	initCmd.Flags().BoolVarP(&InitGitFlag, "git", "g", false, "Initialize a git repository")
	initCmd.Flags().BoolVarP(&InstallFlag, "install", "i", false, "Install dependencies automatically")
	initCmd.Flags().BoolVar(&SkipInstallFlag, "skip-install", false, "Skip installing dependencies")
	initCmd.Flags().StringVar(&PMFlag, "pm", "", "Package manager to use (npm, pnpm, yarn, bun, deno)")
	rootCmd.AddCommand(initCmd)
}
