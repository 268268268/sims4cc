//go:build windows

package main

import (
	"log"

	"golang.org/x/sys/windows"
)

// setProcessPriority устанавливает пониженный приоритет (BELOW_NORMAL_PRIORITY_CLASS)
// для процесса на Windows, чтобы фоновые тяжелые операции (сканирование, вычисление отпечатков)
// не конкурировали с отрисовкой интерфейса и системным планировщиком.
func setProcessPriority() {
	handle := windows.CurrentProcess()
	if err := windows.SetPriorityClass(handle, windows.BELOW_NORMAL_PRIORITY_CLASS); err != nil {
		log.Printf("[PRIORITY] Failed to set BELOW_NORMAL_PRIORITY_CLASS: %v", err)
	}
}
