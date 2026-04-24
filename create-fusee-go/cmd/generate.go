package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"
	"github.com/spf13/cobra"
)

var genCmd = &cobra.Command{
	Use:     "generate [type] [name]",
	Aliases: []string{"g"},
	Short:   "Generate a new page or component",
	Long: `Generate a new Fusée resource. 
Types available: page (p), component (c)`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		genType := strings.ToLower(args[0])
		name := strings.Title(args[1])

		// Check if we are in a Fusée project
		if _, err := os.Stat("framework"); os.IsNotExist(err) {
			fmt.Println("❌ Error: This command must be run from the root of a Fusée project.")
			os.Exit(1)
		}

		ext := "js"
		if _, err := os.Stat("tsconfig.json"); err == nil {
			ext = "ts"
		}

		config := assets.Config{
			ProjectName: name,
			IsTS:        ext == "ts",
			Ext:         ext,
		}

		var dest string
		var tmpl string

		switch genType {
		case "page", "p":
			dest = filepath.Join("app/pages", args[1]+"."+ext)
			tmpl = "templates/page.tmpl"
		case "component", "c":
			dest = filepath.Join("app/components", args[1]+"."+ext)
			tmpl = "templates/component.tmpl"
		default:
			fmt.Printf("❌ Error: Unknown type '%s'. Use 'page' or 'component'.\n", genType)
			os.Exit(1)
		}

		if _, err := os.Stat(dest); err == nil {
			fmt.Printf("❌ Error: File '%s' already exists.\n", dest)
			os.Exit(1)
		}

		if err := assets.WriteTemplate(tmpl, dest, config); err != nil {
			fmt.Printf("❌ Error: Could not generate %s: %v\n", genType, err)
			os.Exit(1)
		}

		fmt.Printf("✅ %s created: %s\n", strings.Title(genType), dest)
	},
}

func init() {
	rootCmd.AddCommand(genCmd)
}
