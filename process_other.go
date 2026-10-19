//go:build !windows

package main

// setProcessPriority на не-Windows платформах является заглушкой (no-op).
func setProcessPriority() {
}
