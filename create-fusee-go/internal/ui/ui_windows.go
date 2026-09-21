//go:build windows

package ui

import (
	"os"

	"golang.org/x/sys/windows"
)

func enableVirtualTerminal() {
	stdout := windows.Handle(os.Stdout.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(stdout, &mode); err == nil {
		_ = windows.SetConsoleMode(stdout, mode|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING)
	}
	stdin := windows.Handle(os.Stdin.Fd())
	if err := windows.GetConsoleMode(stdin, &mode); err == nil {
		_ = windows.SetConsoleMode(stdin, mode|windows.ENABLE_VIRTUAL_TERMINAL_INPUT)
	}
}
