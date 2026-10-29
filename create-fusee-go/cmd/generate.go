package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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
  - action (a): app/actions/<name>.<ext>
  - element (el): app/elements/<tag-name>.<ext> (a custom element; the name needs a hyphen)`,
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
		case "element", "el":
			tag := strings.ToLower(rawName)
			if err := validateElementName(tag); err != nil {
				ui.Error(err.Error())
				os.Exit(1)
			}
			config.TagName = tag
			dest = filepath.Join("app/elements", tag+"."+logicExt)
			tmpl = "templates/element.tmpl"
		default:
			ui.Error(fmt.Sprintf("Unknown type '%s'. Use page (p), component (c), store (s), composable (use), action (a), or element (el).", genType))
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

		ui.Success(fmt.Sprintf("%s created: %s", strings.Title(canonicalTypes[genType]), dest))
		if canonicalTypes[genType] == "element" {
			ui.Info(fmt.Sprintf("Use it as <%s></%s> in any template or HTML page.", config.TagName, config.TagName))
			if !entryRegistersElements() {
				ui.Info("Register app/elements once by adding to app/main: import.meta.glob('./elements/**/*.{js,ts}', { eager: true });")
			}
		}
	},
}

// canonicalTypes maps each generator type and alias to its full name, for messages.
var canonicalTypes = map[string]string{
	"page": "page", "p": "page",
	"component": "component", "c": "component",
	"store": "store", "s": "store",
	"composable": "composable", "use": "composable",
	"action": "action", "a": "action",
	"element": "element", "el": "element",
}

var elementNamePattern = regexp.MustCompile(`^[a-z][a-z0-9._]*(-[a-z0-9._]*)+$`)

// reservedElementNames are hyphenated names the HTML spec keeps for SVG and MathML.
var reservedElementNames = map[string]bool{
	"annotation-xml": true, "color-profile": true, "font-face": true, "font-face-src": true,
	"font-face-uri": true, "font-face-format": true, "font-face-name": true, "missing-glyph": true,
}

// entryRegistersElements reports whether the app entry already imports app/elements.
func entryRegistersElements() bool {
	for _, ext := range []string{"js", "ts", "jsx", "tsx"} {
		data, err := os.ReadFile(filepath.Join("app", "main."+ext))
		if err == nil && strings.Contains(string(data), "./elements/") {
			return true
		}
	}
	return false
}

// validateElementName checks the rules browsers apply in customElements.define().
func validateElementName(tag string) error {
	if !strings.Contains(tag, "-") {
		return fmt.Errorf("Custom element names must contain a hyphen, e.g. 'fu-%s'.", tag)
	}
	if !elementNamePattern.MatchString(tag) {
		return fmt.Errorf("'%s' is not a valid custom element name: start with a letter and use only lowercase letters, digits, '-', '.' and '_'.", tag)
	}
	if reservedElementNames[tag] {
		return fmt.Errorf("'%s' is reserved by the HTML spec; pick another name.", tag)
	}
	return nil
}

func init() {
	rootCmd.AddCommand(genCmd)
}
