package metrics

import (
	"os"
	"runtime"
	"sync/atomic"
	"time"
)

var (
	startTime      = time.Now()
	requestCounter uint64
)

// IncRequests increments the server operation counter.
func IncRequests() {
	atomic.AddUint64(&requestCounter, 1)
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
	PID        int   `json:"pid"`
	Goroutines int   `json:"goroutines"`
	NumCPU     int   `json:"num_cpu"`
	GOMAXPROCS int   `json:"gomaxprocs"`
	NumCgoCall int64 `json:"num_cgo_call"`
}

type MemoryInfo struct {
	AllocBytes      uint64 `json:"alloc_bytes"`
	TotalAllocBytes uint64 `json:"total_alloc_bytes"`
	SysBytes        uint64 `json:"sys_bytes"`
	HeapAllocBytes  uint64 `json:"heap_alloc_bytes"`
	HeapSysBytes    uint64 `json:"heap_sys_bytes"`
	HeapObjects     uint64 `json:"heap_objects"`
	NumGC           uint32 `json:"num_gc"`
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
			PID:        os.Getpid(),
			Goroutines: runtime.NumGoroutine(),
			NumCPU:     runtime.NumCPU(),
			GOMAXPROCS: runtime.GOMAXPROCS(0),
			NumCgoCall: runtime.NumCgoCall(),
		},
		Memory: MemoryInfo{
			AllocBytes:      ms.Alloc,
			TotalAllocBytes: ms.TotalAlloc,
			SysBytes:        ms.Sys,
			HeapAllocBytes:  ms.HeapAlloc,
			HeapSysBytes:    ms.HeapSys,
			HeapObjects:     ms.HeapObjects,
			NumGC:           ms.NumGC,
		},
	}
}
