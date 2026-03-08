import { useState, useEffect, useRef, useCallback } from 'react'

export type JobStatus = 'started' | 'processing' | 'completed' | 'failed'

export interface LogEntry {
  status: JobStatus
  message: string
}

interface JobProgressState {
  status: JobStatus | 'queued' | null
  log: LogEntry[]
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed'])
const EVENT_TYPES: JobStatus[] = ['started', 'processing', 'completed', 'failed']

export function useJobProgress(jobId: string | null): JobProgressState {
  const [state, setState] = useState<JobProgressState>({
    status: null,
    log: [],
  })

  const eventSourceRef = useRef<EventSource | null>(null)

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jobId) {
      setState({ status: null, log: [] })
      return
    }

    setState({ status: 'queued', log: [] })
    let cancelled = false

    async function init() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        const initialLog: LogEntry[] = data.message
          ? [{ status: data.status, message: data.message }]
          : []
        setState({ status: data.status, log: initialLog })

        if (TERMINAL_STATUSES.has(data.status)) return
      } catch {
        if (cancelled) return
      }

      const es = new EventSource(`/api/jobs/${jobId}/sse`)
      eventSourceRef.current = es

      function handleEvent(e: MessageEvent) {
        if (cancelled) return
        const status = e.type as JobStatus
        setState((prev) => ({
          status,
          log: [...prev.log, { status, message: e.data }],
        }))

        if (TERMINAL_STATUSES.has(status)) {
          es.close()
          eventSourceRef.current = null
        }
      }

      for (const type of EVENT_TYPES) {
        es.addEventListener(type, handleEvent)
      }

      es.onerror = () => {
        if (cancelled) return
        es.close()
        eventSourceRef.current = null
      }
    }

    init()

    return () => {
      cancelled = true
      closeEventSource()
    }
  }, [jobId, closeEventSource])

  return state
}
