import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useJobProgress, type LogEntry } from '@/hooks/useJobProgress'
import { cn } from '@/lib/utils'

interface ExportJobDialogProps {
  jobId: string | null
  onClose: () => void
}

function statusColor(status: LogEntry['status']): string {
  if (status === 'completed') return 'text-green-400'
  if (status === 'failed') return 'text-red-400'
  return 'text-neutral-400'
}

function statusSymbol(status: LogEntry['status']): string {
  if (status === 'completed') return '✓'
  if (status === 'failed') return '✗'
  if (status === 'started') return '▶'
  return '…'
}

function LogViewer({ entries }: { entries: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div
      ref={containerRef}
      className="h-48 overflow-y-auto rounded bg-neutral-950 p-3 text-xs font-mono leading-5"
    >
      {entries.length === 0 && (
        <span className="text-neutral-500">Ожидание событий…</span>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2">
          <span className={cn(statusColor(entry.status))}>{statusSymbol(entry.status)}</span>
          <span className="text-neutral-200">{entry.message}</span>
        </div>
      ))}
    </div>
  )
}

export function ExportJobDialog({ jobId, onClose }: ExportJobDialogProps) {
  const { log } = useJobProgress(jobId)

  return (
    <Dialog open={!!jobId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter Service</DialogTitle>
        </DialogHeader>
        <LogViewer entries={log} />
      </DialogContent>
    </Dialog>
  )
}
