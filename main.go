package main

import (
	"context"
	"embed"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData, _ = os.UserConfigDir()
	}
	logDir := appData + "\\sims4-mod-manager"
	_ = os.MkdirAll(logDir, 0755)
	logFile := logDir + "\\wails_debug.log"
	fileLogger := logger.NewFileLogger(logFile)

	err := wails.Run(&options.App{
		Title:     "Sims 4 Mod Manager",
		Width:     1280,
		Height:    820,
		MinWidth:  960,
		MinHeight: 640,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
		},
		AssetServer: &assetserver.Options{
			Assets: assets,
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Раздача локальных миниатюр и изображений модов (r.URL.Query().Get уже декодирует percent-encoding)
				if r.URL.Path == "/modimg" || strings.HasPrefix(r.URL.Path, "/modimg") {
					p := r.URL.Query().Get("p")
					if p != "" {
						data, err := os.ReadFile(p)
						if err == nil {
							low := strings.ToLower(p)
							if strings.HasSuffix(low, ".png") {
								w.Header().Set("Content-Type", "image/png")
							} else if strings.HasSuffix(low, ".jpg") || strings.HasSuffix(low, ".jpeg") {
								w.Header().Set("Content-Type", "image/jpeg")
							} else if strings.HasSuffix(low, ".webp") {
								w.Header().Set("Content-Type", "image/webp")
							} else if strings.HasSuffix(low, ".gif") {
								w.Header().Set("Content-Type", "image/gif")
							}
							w.Header().Set("Cache-Control", "public, max-age=86400")
							w.Write(data)
							return
						}
					}
					w.WriteHeader(http.StatusNotFound)
					return
				}
				http.NotFound(w, r)
			}),
		},
		Logger:           fileLogger,
		LogLevel:         logger.INFO,
		BackgroundColour: &options.RGBA{R: 9, G: 13, B: 22, A: 255},
		OnStartup:        app.startup,
		OnDomReady: func(ctx context.Context) {
			fileLogger.Info("[DOM] DOM ready")
		},
		OnBeforeClose: func(ctx context.Context) bool {
			fileLogger.Info("[CLOSE] OnBeforeClose called")
			return false
		},
		OnShutdown: func(ctx context.Context) {
			fileLogger.Info("[SHUTDOWN] OnShutdown called")
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			WebviewGpuIsDisabled: false, // Включаем GPU-ускорение (DirectX / Hardware WebGL)
			Theme:                windows.Dark,
			ResizeDebounceMS:     10,
		},
	})

	if err != nil {
		fileLogger.Error("wails.Run error: " + err.Error())
		println("Error:", err.Error())
	}
}

