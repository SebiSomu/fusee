package cmd

import (
	"bufio"
	"fmt"
	"os"
	epath "path"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"

	"github.com/spf13/cobra"
)

var IsTSFlag bool
var UseJSXFlag bool
var UseTailwindFlag bool

var rootCmd = &cobra.Command{
	Use:   "fusee",
	Short: "Fusée is a high-performance reactive framework CLI",
	Long: `Fusée CLI helps you scaffold new projects, generate components, 
and manage your Fusée application development workflow.`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			isTS, isJSX, useTailwind := resolveTemplateFlags(cmd)
			runInitWithParams(args[0], isTS, isJSX, useTailwind)
		} else {
			cmd.Help()
		}
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().BoolVarP(&IsTSFlag, "ts", "t", false, "Use TypeScript template")
	rootCmd.Flags().BoolVarP(&UseJSXFlag, "jsx", "j", false, "Use the JSX/TSX template style")
	rootCmd.Flags().BoolVarP(&UseTailwindFlag, "tailwind", "w", false, "Set up Tailwind CSS")
}

func resolveTemplateFlags(cmd *cobra.Command) (isTS bool, isJSX bool, useTailwind bool) {
	reader := bufio.NewReader(os.Stdin)

	isJSX = UseJSXFlag
	if !cmd.Flags().Changed("jsx") {
		fmt.Printf("Template style [normal (n) / jsx (j)] (default: normal): ")
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		isJSX = cleaned == "j" || cleaned == "jsx"
	}

	isTS = IsTSFlag
	if !cmd.Flags().Changed("ts") {
		if isJSX {
			fmt.Printf("Use TypeScript (tsx)? [y/N] (default: no): ")
		} else {
			fmt.Printf("Select language template [JavaScript (js) / TypeScript (ts)] (default: js): ")
		}
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		if isJSX {
			isTS = cleaned == "y" || cleaned == "yes"
		} else {
			isTS = cleaned == "ts"
		}
	}

	useTailwind = UseTailwindFlag
	if !cmd.Flags().Changed("tailwind") {
		fmt.Printf("Styling [default (d) / tailwind (t)] (default: default): ")
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		useTailwind = cleaned == "t" || cleaned == "tailwind"
	}

	return isTS, isJSX, useTailwind
}

func variantTemplate(p string, isJSX bool) string {
	if !isJSX {
		return p
	}
	dir := epath.Dir(p)
	file := epath.Base(p)
	return epath.Join(dir, "jsx", file)
}

func runInitWithParams(projectName string, isTS bool, isJSX bool, useTailwind bool) {
	if strings.ContainsAny(projectName, " !@#$%^&*()") {
		fmt.Printf("Error: Project name '%s' contains invalid characters.\n", projectName)
		os.Exit(1)
	}

	projectPath, err := filepath.Abs(projectName)
	if err != nil {
		fmt.Printf("Error: Could not determine absolute path: %v\n", err)
		os.Exit(1)
	}

	if _, err := os.Stat(projectPath); !os.IsNotExist(err) && projectName != "." {
		fmt.Printf("Error: Directory '%s' already exists.\n", projectName)
		os.Exit(1)
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

	fmt.Printf("\nScaffolding a new project in: %s...\n", projectPath)

	config := assets.Config{
		ProjectName: filepath.Base(projectName),
		IsTS:        isTS,
		IsJSX:       isJSX,
		UseTailwind: useTailwind,
		Ext:         ext,
		BtnStyle:    "background:#ff3333; color:white; border:none; width:50px; height:50px; border-radius:15px; cursor:pointer; font-size:1.5rem; transition: 0.2s;",
	}
	if projectName == "." {
		config.ProjectName = "fusee-project"
	}

	dirs := []string{
		"app/components",
		"app/pages",
		"app/routes",
		"app/stores",
		"app/composables",
		"app/actions",
		"framework",
		".fusee",
	}
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(projectPath, d), 0755); err != nil {
			fmt.Printf("Error: Could not create directory %s: %v\n", d, err)
			os.Exit(1)
		}
	}

	if err := assets.WriteProjectMeta(projectPath, assets.ProjectMeta{IsTS: isTS, IsJSX: isJSX, UseTailwind: useTailwind}); err != nil {
		fmt.Printf("Error: Could not write project metadata: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Injecting Fusée Core Engine...")
	if err := assets.CopyEmbeddedDir("embed/framework", filepath.Join(projectPath, "framework"), isTS, isJSX); err != nil {
		fmt.Printf("Error: Could not inject framework: %v\n", err)
		os.Exit(1)
	}

	files := map[string]string{
		"templates/package.json.tmpl":   "package.json",
		"templates/vite.config.js.tmpl": "vite.config.js",
		"templates/index.html.tmpl":     "index.html",
	}
	files[variantTemplate("templates/main.tmpl", isJSX)] = "app/main." + ext
	files[variantTemplate("templates/components/Loading.tmpl", isJSX)] = "app/components/Loading." + ext
	files[variantTemplate("templates/pages/layout.tmpl", isJSX)] = "app/pages/_layout." + ext
	files[variantTemplate("templates/pages/index.tmpl", isJSX)] = "app/pages/index." + ext
	files[variantTemplate("templates/pages/about.tmpl", isJSX)] = "app/pages/about." + ext
	files[variantTemplate("templates/Counter.tmpl", isJSX)] = "app/components/Counter." + ext
	if isTS {
		files["templates/tsconfig.json.tmpl"] = "tsconfig.json"
	}
	if useTailwind {
		files["templates/styles.css.tmpl"] = "app/styles.css"
	}

	for src, dest := range files {
		if err := assets.WriteTemplate(src, filepath.Join(projectPath, dest), config); err != nil {
			fmt.Printf("Error: Could not write file %s: %v\n", dest, err)
			os.Exit(1)
		}
	}

	fmt.Println("\nFusée Project Ready!")
	fmt.Printf("   cd %s && npm install\n", projectName)
	fmt.Println()
	fmt.Println("   SPA mode (no server needed):")
	fmt.Println("        npm run dev:spa     → Vite dev server on port 5173")
	fmt.Println()
	fmt.Println("   SSR mode (optional Go server):")
	fmt.Println("        fusee add server    → install the Go SSR engine")
	fmt.Println("        npm run dev         → start Go server on port 3000")
	fmt.Println()
}
