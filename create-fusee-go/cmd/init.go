package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
)


var initCmd = &cobra.Command{
	Use:   "init [project-name]",
	Short: "Initialize a new Fusée project",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		projectName := "my-fusee-app"
		if len(args) > 0 {
			projectName = args[0]
		}
		
		isTS := IsTSFlag
		if !cmd.Flags().Changed("ts") {
			reader := bufio.NewReader(os.Stdin)
			fmt.Printf("🧬 Select language template [JavaScript (js) / TypeScript (ts)] (default: js): ")
			langInput, _ := reader.ReadString('\n')
			isTS = strings.TrimSpace(strings.ToLower(langInput)) == "ts"
		}
		
		runInitWithParams(projectName, isTS)
	},
}

func init() {
	initCmd.Flags().BoolVarP(&IsTSFlag, "ts", "t", false, "Use TypeScript template")
	rootCmd.AddCommand(initCmd)
}
