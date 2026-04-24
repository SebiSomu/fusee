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

var IsTSFlag bool

var rootCmd = &cobra.Command{
	Use:   "fusee",
	Short: "Fusée is a high-performance reactive framework CLI",
	Long: `Fusée CLI helps you scaffold new projects, generate components, 
and manage your Fusée application development workflow.`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			isTS := IsTSFlag
			if !cmd.Flags().Changed("ts") {
				reader := bufio.NewReader(os.Stdin)
				fmt.Printf("🧬 Select language template [JavaScript (js) / TypeScript (ts)] (default: js): ")
				langInput, _ := reader.ReadString('\n')
				isTS = strings.TrimSpace(strings.ToLower(langInput)) == "ts"
			}
			runInitWithParams(args[0], isTS)
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
}

func runInitWithParams(projectName string, isTS bool) {
	if strings.ContainsAny(projectName, " !@#$%^&*()") {
		fmt.Printf("❌ Error: Project name '%s' contains invalid characters.\n", projectName)
		os.Exit(1)
	}

	projectPath, err := filepath.Abs(projectName)
	if err != nil {
		fmt.Printf("❌ Error: Could not determine absolute path: %v\n", err)
		os.Exit(1)
	}

	if _, err := os.Stat(projectPath); !os.IsNotExist(err) && projectName != "." {
		fmt.Printf("❌ Error: Directory '%s' already exists.\n", projectName)
		os.Exit(1)
	}

	ext := "js"
	if isTS {
		ext = "ts"
	}

	fmt.Printf("\n🚀 Scaffolding a new project in: %s...\n", projectPath)

	config := assets.Config{
		ProjectName: filepath.Base(projectName),
		IsTS:        isTS,
		Ext:         ext,
		BtnStyle:    "background:#ff3333; color:white; border:none; width:50px; height:50px; border-radius:15px; cursor:pointer; font-size:1.5rem; transition: 0.2s;",
	}
	if projectName == "." {
		config.ProjectName = "fusee-project"
	}

	dirs := []string{"app/components", "app/pages", "app/routes", "framework"}
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(projectPath, d), 0755); err != nil {
			fmt.Printf("❌ Error: Could not create directory %s: %v\n", d, err)
			os.Exit(1)
		}
	}

	fmt.Println("📦 Injecting Fusée Core Engine...")
	if err := assets.CopyEmbeddedDir("embed/framework", filepath.Join(projectPath, "framework"), isTS); err != nil {
		fmt.Printf("❌ Error: Could not inject framework: %v\n", err)
		os.Exit(1)
	}

	files := map[string]string{
		"templates/package.json.tmpl":       "package.json",
		"templates/vite.config.js.tmpl":     "vite.config.js",
		"templates/index.html.tmpl":         "index.html",
		"templates/main.tmpl":               "app/main." + ext,
		"templates/components/Loading.tmpl": "app/components/Loading." + ext,
		"templates/pages/layout.tmpl":       "app/pages/_layout." + ext,
		"templates/pages/index.tmpl":        "app/pages/index." + ext,
		"templates/pages/about.tmpl":        "app/pages/about." + ext,
		"templates/Counter.tmpl":            "app/components/Counter." + ext,
	}
	if isTS {
		files["templates/tsconfig.json.tmpl"] = "tsconfig.json"
	}

	for src, dest := range files {
		if err := assets.WriteTemplate(src, filepath.Join(projectPath, dest), config); err != nil {
			fmt.Printf("❌ Error: Could not write file %s: %v\n", dest, err)
			os.Exit(1)
		}
	}

	fmt.Println("\n✅ Fusée Project Ready!")
	fmt.Printf("👉 Run: cd %s && npm install && npm run dev\n\n", projectName)
}
