//go:build windows

package actions

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	shell32          = syscall.NewLazyDLL("shell32.dll")
	shFileOperationW = shell32.NewProc("SHFileOperationW")
)

const (
	foDelete          = 0x0003
	fofAllowUndo      = 0x0040
	fofNoConfirmation = 0x0010
	fofSilent         = 0x0004
)

type shFileOpStructW struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

// MoveToRecycleBin перемещает файл в Корзину Windows через Shell API
func MoveToRecycleBin(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	// SHFileOperation требует double-null terminated строку
	utf16Path, err := syscall.UTF16FromString(absPath)
	if err != nil {
		return err
	}
	buf := append(utf16Path, 0)

	op := shFileOpStructW{
		wFunc:  foDelete,
		pFrom:  &buf[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofSilent,
	}

	ret, _, _ := shFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	if ret != 0 {
		// Резервное удаление
		return os.Remove(absPath)
	}
	return nil
}

// ShowItemInFolder открывает проводник и выделяет файл
func ShowItemInFolder(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", fmt.Sprintf("/select,%s", absPath)).Start()
}

// OpenDirectory открывает указанную папку в проводнике
func OpenDirectory(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", absPath).Start()
}

// OpenExternal открывает URL в браузере по умолчанию
func OpenExternal(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
