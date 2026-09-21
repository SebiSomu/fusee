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

		if _, err := os.Stat("framework"); os.IsNotExist(err) {
			ui.Error("This command must be run from the root of a Fusée project.")
			os.Exit(1)
		}

		isTS := false
		isJSX := false
		if meta, err := assets.ReadProjectMeta("."); err == nil {
			isTS = meta.IsTS
			isJSX = meta.IsJSX
		} else if _, err := os.Stat("tsconfig.json"); err == nil {
			isTS = true
		}

		ext := "js"
		switch {
		case isJSX && isTS:
			ext = "tsx"
		case isJSX:
			ext = "jsx"
		case isTS:
			ext = "ts"
		}

		logicExt := "js"
		if isTS {
			logicExt = "ts"
		}

		config := assets.Config{
			ProjectName: name,
			IsTS:        isTS,
			IsJSX:       isJSX,
			Ext:         ext,
		}

		var dest string
		var tmpl string

		switch genType {
		case "page", "p":
			dest = filepath.Join("app/pages", rawName+"."+ext)
			tmpl = variantTemplate("templates/page.tmpl", isJSX)
		case "component", "c":
			dest = filepath.Join("app/components", name+"."+ext)
			tmpl = variantTemplate("templates/component.tmpl", isJSX)
		case "store", "s":
			dest = filepath.Join("app/stores", rawName+"."+logicExt)
			tmpl = "templates/store.tmpl"
		case "composable", "use":
			compName := rawName
			if !strings.HasPrefix(strings.ToLower(compName), "use") {
				compName = "use" + name
			}
			dest = filepath.Join("app/composables", compName+"."+logicExt)
			tmpl = "templates/composable.tmpl"
		case "action", "a":
			dest = filepath.Join("app/actions", rawName+"."+logicExt)
			tmpl = "templates/action.tmpl"
		default:
			ui.Error(fmt.Sprintf("Unknown type '%s'. Use page (p), component (c), store (s), composable (use), or action (a).", genType))
			os.Exit(1)
		}

		if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			ui.Error(fmt.Sprintf("Could not create directory %s: %v", filepath.Dir(dest), err))
			os.Exit(1)
		}

		if _, err := os.Stat(dest); err == nil {
			ui.Error(fmt.Sprintf("File '%s' already exists.", dest))
			os.Exit(1)
		}

		if err := assets.WriteTemplate(tmpl, dest, config); err != nil {
			ui.Error(fmt.Sprintf("Could not generate %s: %v", genType, err))
			os.Exit(1)
		}

		ui.Success(fmt.Sprintf("%s created: %s", strings.Title(genType), dest))
	},
}

func init() {
	rootCmd.AddCommand(genCmd)
}
