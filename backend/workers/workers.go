package workers

import "runtime"

// Count возвращает рекомендуемое число воркеров для фоновых задач,
// оставляя свободные ядра для UI и системных процессов: max(1, runtime.NumCPU()-2).
func Count() int {
	return max(1, runtime.NumCPU()-2)
}
