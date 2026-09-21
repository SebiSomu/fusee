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

		isTS, isJSX, useTailwind := resolveTemplateFlags(cmd)

		runInitWithParams(projectName, isTS, isJSX, useTailwind)
	},
}

func init() {
	initCmd.Flags().BoolVarP(&IsTSFlag, "ts", "t", false, "Use TypeScript template")
	initCmd.Flags().BoolVarP(&UseJSXFlag, "jsx", "j", false, "Use the JSX/TSX template style")
	initCmd.Flags().BoolVarP(&UseTailwindFlag, "tailwind", "w", false, "Set up Tailwind CSS")
	rootCmd.AddCommand(initCmd)
}
