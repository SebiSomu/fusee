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
Types available:
  - page (p): app/pages/<name>.<ext>
  - component (c): app/components/<name>.<ext>
  - store (s): app/stores/<name>.<ext>
  - composable (use): app/composables/use<name>.<ext>
  - action (a): app/actions/<name>.<ext>`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		genType := strings.ToLower(args[0])
		rawName := args[1]
		name := strings.Title(rawName)

		// Check if we are in a Fusée project
		if _, err := os.Stat("framework"); os.IsNotExist(err) {
			fmt.Println("Error: This command must be run from the root of a Fusée project.")
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
			dest = filepath.Join("app/pages", rawName+"."+ext)
			tmpl = "templates/page.tmpl"
		case "component", "c":
			dest = filepath.Join("app/components", name+"."+ext)
			tmpl = "templates/component.tmpl"
		case "store", "s":
			dest = filepath.Join("app/stores", rawName+"."+ext)
			tmpl = "templates/store.tmpl"
		case "composable", "use":
			compName := rawName
			if !strings.HasPrefix(strings.ToLower(compName), "use") {
				compName = "use" + name
			}
			dest = filepath.Join("app/composables", compName+"."+ext)
			tmpl = "templates/composable.tmpl"
		case "action", "a":
			dest = filepath.Join("app/actions", rawName+"."+ext)
			tmpl = "templates/action.tmpl"
		default:
			fmt.Printf("Error: Unknown type '%s'. Use page (p), component (c), store (s), composable (use), or action (a).\n", genType)
			os.Exit(1)
		}

		if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			fmt.Printf("Error: Could not create directory %s: %v\n", filepath.Dir(dest), err)
			os.Exit(1)
		}

		if _, err := os.Stat(dest); err == nil {
			fmt.Printf("Error: File '%s' already exists.\n", dest)
			os.Exit(1)
		}

		if err := assets.WriteTemplate(tmpl, dest, config); err != nil {
			fmt.Printf("Error: Could not generate %s: %v\n", genType, err)
			os.Exit(1)
		}

		fmt.Printf("%s created: %s\n", strings.Title(genType), dest)
	},
}

func init() {
	rootCmd.AddCommand(genCmd)
}
