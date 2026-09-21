package ui

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

// ANSI color codes
const (
	Reset     = "\033[0m"
	Bold      = "\033[1m"
	Dim       = "\033[2m"
	Italic    = "\033[3m"
	Underline = "\033[4m"

	FgBlack     = "\033[30m"
	FgRed       = "\033[31m"
	FgGreen     = "\033[32m"
	FgYellow    = "\033[33m"
	FgBlue      = "\033[34m"
	FgMagenta   = "\033[35m"
	FgCyan      = "\033[36m"
	FgWhite     = "\033[37m"
	FgGray      = "\033[90m"
	FgHiRed     = "\033[91m"
	FgHiGreen   = "\033[92m"
	FgHiYellow  = "\033[93m"
	FgHiBlue    = "\033[94m"
	FgHiMagenta = "\033[95m"
	FgHiCyan    = "\033[96m"
	FgHiWhite   = "\033[97m"

	BoldRed       = "\033[1;31m"
	BoldGreen     = "\033[1;32m"
	BoldYellow    = "\033[1;33m"
	BoldBlue      = "\033[1;34m"
	BoldMagenta   = "\033[1;35m"
	BoldCyan      = "\033[1;36m"
	BoldWhite     = "\033[1;37m"
	BoldHiYellow  = "\033[1;93m"
	BoldHiBlue    = "\033[1;94m"
	BoldHiMagenta = "\033[1;95m"
	BoldHiCyan    = "\033[1;96m"

	BgCyan    = "\033[46;30m"
	BgMagenta = "\033[45;37m"
	BgRed     = "\033[41;37m"
	BgGreen   = "\033[42;30m"
	BgGray    = "\033[100;37m"
)

func init() {
	enableVirtualTerminal()
}

// Banner displays the stylish Fusée header
func Banner() {
	fmt.Println()
	fmt.Printf("  %s%s Fusée Framework %s  %sv2.4.0%s\n", BgCyan, Bold, Reset, FgGray, Reset)
	fmt.Printf("  %sHigh-performance signals-first reactive web framework%s\n\n", FgGray, Reset)
}

type SelectOption struct {
	Label string
	Desc  string
	Value string
	Color string
}

// Select displays an interactive choice menu with up/down arrows and clean rendering
func Select(title string, options []SelectOption, defaultIndex int) string {
	if len(options) == 0 {
		return ""
	}
	if defaultIndex < 0 || defaultIndex >= len(options) {
		defaultIndex = 0
	}

	fd := int(os.Stdin.Fd())
	// Fallback for non-interactive environments (CI, pipes)
	if !term.IsTerminal(fd) {
		reader := bufio.NewReader(os.Stdin)
		fmt.Printf("%s?%s %s%s%s (default: %s): ", BoldCyan, Reset, Bold, title, Reset, options[defaultIndex].Label)
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		if cleaned == "" {
			return options[defaultIndex].Value
		}
		for _, opt := range options {
			if strings.EqualFold(cleaned, opt.Value) || strings.EqualFold(cleaned, opt.Label) || strings.HasPrefix(strings.ToLower(opt.Label), cleaned) {
				return opt.Value
			}
		}
		return options[defaultIndex].Value
	}

	// Interactive mode with terminal raw mode
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		reader := bufio.NewReader(os.Stdin)
		fmt.Printf("%s?%s %s%s%s: ", BoldCyan, Reset, Bold, title, Reset)
		input, _ := reader.ReadString('\n')
		cleaned := strings.TrimSpace(strings.ToLower(input))
		for _, opt := range options {
			if strings.EqualFold(cleaned, opt.Value) || strings.EqualFold(cleaned, opt.Label) {
				return opt.Value
			}
		}
		return options[defaultIndex].Value
	}
	defer term.Restore(fd, oldState)

	// Hide cursor during navigation
	fmt.Print("\033[?25l")
	defer fmt.Print("\033[?25h")

	selected := defaultIndex
	numOpts := len(options)

	render := func(firstTime bool) {
		if !firstTime {
			// Move cursor up by numOpts lines
			fmt.Printf("\033[%dA\r", numOpts)
		}
		for i, opt := range options {
			fmt.Print("\033[2K\r") // Clear line and carriage return
			optColor := opt.Color
			if optColor == "" {
				optColor = BoldWhite
			}

			if i == selected {
				fmt.Printf("  %s❯%s %s%s%s", BoldCyan, Reset, optColor, opt.Label, Reset)
				if opt.Desc != "" {
					fmt.Printf("  %s%s%s", FgGray, opt.Desc, Reset)
				}
			} else {
				// Dimmed colored label when not selected
				dimColor := opt.Color
				if dimColor == "" {
					dimColor = FgGray
				}
				fmt.Printf("    %s%s%s", dimColor, opt.Label, Reset)
				if opt.Desc != "" {
					fmt.Printf("  %s%s%s", Dim+FgGray, opt.Desc, Reset)
				}
			}
			fmt.Print("\r\n")
		}
	}

	fmt.Printf("%s?%s %s%s%s\r\n", BoldCyan, Reset, Bold, title, Reset)
	render(true)

	buf := make([]byte, 3)
	for {
		n, err := os.Stdin.Read(buf)
		if err != nil {
			break
		}

		if n == 1 {
			b := buf[0]
			switch b {
			case 3: // Ctrl+C
				_ = term.Restore(fd, oldState)
				fmt.Print("\033[?25h\r\n")
				os.Exit(0)
			case 13, 10: // Enter
				// Erase the options lines and header completely
				fmt.Printf("\033[%dA\r", numOpts+1)
				for i := 0; i <= numOpts; i++ {
					fmt.Print("\033[2K\r\n")
				}
				fmt.Printf("\033[%dA\r", numOpts+1)

				choiceColor := options[selected].Color
				if choiceColor == "" {
					choiceColor = BoldCyan
				}
				// Print compact confirmed line:
				fmt.Printf("\r\033[2K%s✔%s %s %s›%s %s%s%s\r\n", BoldGreen, Reset, title, FgGray, Reset, choiceColor, options[selected].Label, Reset)
				return options[selected].Value
			case 'k', 'K', 'w', 'W': // Up
				selected = (selected - 1 + numOpts) % numOpts
				render(false)
			case 'j', 'J', 's', 'S': // Down
				selected = (selected + 1) % numOpts
				render(false)
			default:
				if b >= '1' && int(b-'1') < numOpts {
					selected = int(b - '1')
					render(false)
				}
			}
		} else if n == 3 && buf[0] == 27 && buf[1] == 91 { // ESC [
			switch buf[2] {
			case 'A': // Up arrow
				selected = (selected - 1 + numOpts) % numOpts
				render(false)
			case 'B': // Down arrow
				selected = (selected + 1) % numOpts
				render(false)
			}
		} else if n == 3 && buf[0] == 27 && buf[1] == 79 { // ESC O
			switch buf[2] {
			case 'A': // Up arrow
				selected = (selected - 1 + numOpts) % numOpts
				render(false)
			case 'B': // Down arrow
				selected = (selected + 1) % numOpts
				render(false)
			}
		}
	}

	return options[selected].Value
}

// Info prints a muted status message
func Info(msg string) {
	fmt.Printf("\r\033[2K%s◇%s %s\n", FgCyan, Reset, msg)
}

// Step prints a step with indentation
func Step(key, val string) {
	fmt.Printf("\r\033[2K  %s%s%-12s%s %s\n", FgGray, Dim, key, Reset, val)
}

// Success prints a green checkmark item
func Success(msg string) {
	fmt.Printf("\r\033[2K%s✔%s %s%s%s\n", BoldGreen, Reset, BoldWhite, msg, Reset)
}

// Error prints a red error item
func Error(msg string) {
	fmt.Printf("\r\033[2K%s✖%s %s%s%s\n", BoldRed, Reset, BoldWhite, msg, Reset)
}

// NextSteps prints the formatted getting started instructions
func NextSteps(projectName string, isSSR bool) {
	fmt.Println()
	fmt.Printf("%sNext steps:%s\n", BoldWhite, Reset)
	if projectName != "." {
		fmt.Printf("  1. %scd %s%s\n", BoldCyan, projectName, Reset)
		fmt.Printf("  2. %snpm install%s\n", BoldCyan, Reset)
		fmt.Printf("  3. %snpm run dev:spa%s %s(Vite SPA dev server on :5173)%s\n", BoldCyan, Reset, FgGray, Reset)
	} else {
		fmt.Printf("  1. %snpm install%s\n", BoldCyan, Reset)
		fmt.Printf("  2. %snpm run dev:spa%s %s(Vite SPA dev server on :5173)%s\n", BoldCyan, Reset, FgGray, Reset)
	}

	fmt.Println()
	fmt.Printf("%sOptional SSR Mode:%s\n", BoldWhite, Reset)
	fmt.Printf("  %sfusee add server%s    %s→ install Go SSR Engine%s\n", BoldHiMagenta, Reset, FgGray, Reset)
	fmt.Printf("  %snpm run dev%s         %s→ start Go server on :3000%s\n", BoldHiMagenta, Reset, FgGray, Reset)
	fmt.Println()
}
