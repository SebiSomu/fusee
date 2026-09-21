//go:build !windows

package ui

func enableVirtualTerminal() {
	// POSIX terminals handle ANSI escapes natively
}
