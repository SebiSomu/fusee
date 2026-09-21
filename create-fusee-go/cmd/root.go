package cmd

import (
	"fmt"
	"os"
	"os/exec"
	epath "path"
	"path/filepath"
	"strings"

	"create-fusee/internal/assets"
	"create-fusee/internal/ui"

	"github.com/spf13/cobra"
)

var IsTSFlag bool
var UseJSXFlag bool
var UseTailwindFlag bool
var InitGitFlag bool

var rootCmd = &cobra.Command{
	Use:   "fusee",
	Short: "Fusée is a high-performance reactive framework CLI",
	Long: `Fusée CLI helps you scaffold new projects, generate components, 
and manage your Fusée application development workflow.`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			ui.Banner()
			isTS, isJSX, useTailwind, initGit := resolveTemplateFlags(cmd)
			runInitWithParams(args[0], isTS, isJSX, useTailwind, initGit)
		} else {
			cmd.Help()
		}
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		ui.Error(err.Error())
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().BoolVarP(&IsTSFlag, "ts", "t", false, "Use TypeScript template")
	rootCmd.Flags().BoolVarP(&UseJSXFlag, "jsx", "j", false, "Use the JSX/TSX template style")
	rootCmd.Flags().BoolVarP(&UseTailwindFlag, "tailwind", "w", false, "Set up Tailwind CSS")
	rootCmd.Flags().BoolVarP(&InitGitFlag, "git", "g", false, "Initialize a git repository")
}

func resolveTemplateFlags(cmd *cobra.Command) (isTS bool, isJSX bool, useTailwind bool, initGit bool) {
	isJSX = UseJSXFlag
	if !cmd.Flags().Changed("jsx") {
		styleChoice := ui.Select("Select template style", []ui.SelectOption{
			{Label: "Normal", Desc: "HTML-like template strings (Fast & lightweight)", Value: "normal", Color: ui.BoldGreen},
			{Label: "JSX / TSX", Desc: "Modern JSX syntax with compiler transforms", Value: "jsx", Color: ui.BoldHiMagenta},
		}, 0)
		isJSX = styleChoice == "jsx"
	}

	isTS = IsTSFlag
	if !cmd.Flags().Changed("ts") {
		var langChoice string
		if isJSX {
			langChoice = ui.Select("Select language template", []ui.SelectOption{
				{Label: "JavaScript (jsx)", Desc: "Standard JavaScript with JSX syntax", Value: "js", Color: ui.BoldHiYellow},
				{Label: "TypeScript (tsx)", Desc: "Full TypeScript support with strict types", Value: "ts", Color: ui.BoldHiBlue},
			}, 0)
		} else {
			langChoice = ui.Select("Select language template", []ui.SelectOption{
				{Label: "JavaScript", Desc: "Standard modern JavaScript", Value: "js", Color: ui.BoldHiYellow},
				{Label: "TypeScript", Desc: "Full TypeScript support with strict types", Value: "ts", Color: ui.BoldHiBlue},
			}, 0)
		}
		isTS = langChoice == "ts"
	}

	useTailwind = UseTailwindFlag
	if !cmd.Flags().Changed("tailwind") {
		twChoice := ui.Select("Choose styling solution", []ui.SelectOption{
			{Label: "Default", Desc: "Clean vanilla CSS styling", Value: "default", Color: ui.BoldWhite},
			{Label: "Tailwind CSS", Desc: "Tailwind CSS v4 with Vite integration", Value: "tailwind", Color: ui.BoldHiCyan},
		}, 0)
		useTailwind = twChoice == "tailwind"
	}

	initGit = InitGitFlag
	if !cmd.Flags().Changed("git") {
		gitChoice := ui.Select("Initialize a new git repository?", []ui.SelectOption{
			{Label: "Yes", Desc: "Run git init and create initial commit", Value: "yes", Color: ui.BoldGreen},
			{Label: "No", Desc: "Skip git repository setup", Value: "no", Color: ui.BoldWhite},
		}, 0)
		initGit = gitChoice == "yes"
	}

	return isTS, isJSX, useTailwind, initGit
}

func variantTemplate(p string, isJSX bool) string {
	if !isJSX {
		return p
	}
	dir := epath.Dir(p)
	file := epath.Base(p)
	return epath.Join(dir, "jsx", file)
}

func runInitWithParams(projectName string, isTS bool, isJSX bool, useTailwind bool, initGit bool) {
	if strings.ContainsAny(projectName, " !@#$%^&*()") {
		ui.Error(fmt.Sprintf("Project name '%s' contains invalid characters.", projectName))
		os.Exit(1)
	}

	projectPath, err := filepath.Abs(projectName)
	if err != nil {
		ui.Error(fmt.Sprintf("Could not determine absolute path: %v", err))
		os.Exit(1)
	}

	if _, err := os.Stat(projectPath); !os.IsNotExist(err) && projectName != "." {
		ui.Error(fmt.Sprintf("Directory '%s' already exists.", projectName))
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

	fmt.Println()
	ui.Info(fmt.Sprintf("Scaffolding project in %s%s%s...", ui.BoldCyan, projectPath, ui.Reset))

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
			ui.Error(fmt.Sprintf("Could not create directory %s: %v", d, err))
			os.Exit(1)
		}
	}

	if err := assets.WriteProjectMeta(projectPath, assets.ProjectMeta{IsTS: isTS, IsJSX: isJSX, UseTailwind: useTailwind}); err != nil {
		ui.Error(fmt.Sprintf("Could not write project metadata: %v", err))
		os.Exit(1)
	}

	ui.Info("Injecting Fusée Core Engine...")
	if err := assets.CopyEmbeddedDir("embed/framework", filepath.Join(projectPath, "framework"), isTS, isJSX); err != nil {
		ui.Error(fmt.Sprintf("Could not inject framework: %v", err))
		os.Exit(1)
	}

	files := map[string]string{
		"templates/package.json.tmpl":   "package.json",
		"templates/vite.config.js.tmpl": "vite.config.js",
		"templates/index.html.tmpl":     "index.html",
		"templates/gitignore.tmpl":      ".gitignore",
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
			ui.Error(fmt.Sprintf("Could not write file %s: %v", dest, err))
			os.Exit(1)
		}
	}

	if initGit {
		ui.Info("Initializing Git repository...")
		gitInit := exec.Command("git", "init")
		gitInit.Dir = projectPath
		if err := gitInit.Run(); err == nil {
			gitAdd := exec.Command("git", "add", ".")
			gitAdd.Dir = projectPath
			_ = gitAdd.Run()

			gitCommit := exec.Command("git", "commit", "-m", "Initial commit from Fusée CLI")
			gitCommit.Dir = projectPath
			_ = gitCommit.Run()

			ui.Success("Git repository initialized with initial commit")
		} else {
			ui.Info("Skipped git init (git binary not found)")
		}
	}

	ui.Success(fmt.Sprintf("Project %s ready!", filepath.Base(projectName)))
	ui.NextSteps(projectName, false)
}
