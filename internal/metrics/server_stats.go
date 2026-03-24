package metrics

import (
	"os"
	"runtime"
	"runtime/debug"
	"sync/atomic"
	"time"
)

var (
	startTime      = time.Now()
	requestCounter uint64
	inFlight       int64
)

// IncRequests increments the server operation counter.
func IncRequests() {
	atomic.AddUint64(&requestCounter, 1)
}

// IncInFlight increments currently-running request count.
func IncInFlight() {
	atomic.AddInt64(&inFlight, 1)
}

// DecInFlight decrements currently-running request count.
func DecInFlight() {
	atomic.AddInt64(&inFlight, -1)
}

// InFlight returns active request count.
func InFlight() int64 {
	return atomic.LoadInt64(&inFlight)
}

// HealthStats is the payload returned by the health endpoint.
type HealthStats struct {
	Status              string      `json:"status"`
	Service             string      `json:"service"`
	UptimeSeconds       int64       `json:"uptime_seconds"`
	OperationsPerformed uint64      `json:"operations_performed"`
	Process             ProcessInfo `json:"process"`
	Memory              MemoryInfo  `json:"memory"`
}

type ProcessInfo struct {
	PID            int   `json:"pid"`
	Goroutines     int   `json:"goroutines"`
	NumCPU         int   `json:"num_cpu"`
	GOMAXPROCS     int   `json:"gomaxprocs"`
	NumCgoCall     int64 `json:"num_cgo_call"`
	InFlightRoutes int64 `json:"in_flight_routes"`
}

type MemoryInfo struct {
	MemoryLimitMB  float64 `json:"memory_limit_mb"`
	RamUsageMB     float64 `json:"ram_usage_mb"`
	AllocatedRamMB float64 `json:"allocated_ram_mb"`
	HeapAllocMB    float64 `json:"heap_alloc_mb"`
	HeapSysMB      float64 `json:"heap_sys_mb"`
	TotalAllocMB   float64 `json:"total_alloc_mb"`
	HeapObjects    uint64  `json:"heap_objects"`
	NumGC          uint32  `json:"num_gc"`
}

func toMB(v uint64) float64 {
	return float64(v) / (1024.0 * 1024.0)
}

// Snapshot returns current server health and runtime statistics.
func Snapshot() HealthStats {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	return HealthStats{
		Status:              "ok",
		Service:             "chatcraft-api",
		UptimeSeconds:       int64(time.Since(startTime).Seconds()),
		OperationsPerformed: atomic.LoadUint64(&requestCounter),
		Process: ProcessInfo{
			PID:            os.Getpid(),
			Goroutines:     runtime.NumGoroutine(),
			NumCPU:         runtime.NumCPU(),
			GOMAXPROCS:     runtime.GOMAXPROCS(0),
			NumCgoCall:     runtime.NumCgoCall(),
			InFlightRoutes: InFlight(),
		},
		Memory: MemoryInfo{
			MemoryLimitMB:  toMB(uint64(debug.SetMemoryLimit(-1))),
			RamUsageMB:     toMB(ms.Sys),
			AllocatedRamMB: toMB(ms.Alloc),
			HeapAllocMB:    toMB(ms.HeapAlloc),
			HeapSysMB:      toMB(ms.HeapSys),
			TotalAllocMB:   toMB(ms.TotalAlloc),
			HeapObjects:    ms.HeapObjects,
			NumGC:          ms.NumGC,
		},
	}
}
