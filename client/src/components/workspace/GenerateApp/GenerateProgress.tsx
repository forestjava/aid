import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useJobProgress, type LogEntry } from '@/hooks/useJobProgress'
import { cn } from '@/lib/utils'

interface GenerateProgressProps {
  jobId: string | null
  onClose: () => void
}

function statusColor(status: LogEntry['status']): string {
  if (status === 'completed') return 'text-green-400'
  if (status === 'failed') return 'text-red-400'
  if (status === 'started') return 'text-blue-400'
  return 'text-neutral-400'
}

function statusSymbol(status: LogEntry['status']): string {
  if (status === 'completed') return '✓'
  if (status === 'failed') return '✗'
  if (status === 'started') return '▶'
  return '⟳'
}

function phaseLabel(message: string): string | null {
  if (message.startsWith('Step 0:')) return 'Подготовка'
  if (message.startsWith('Phase 1:')) return 'Prisma Schema'
  if (message.startsWith('Phase 2:')) return 'Backend + Frontend'
  if (message.startsWith('Step 3:')) return 'Deploy'
  return null
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
      className="h-80 overflow-y-auto rounded bg-neutral-950 p-3 text-xs font-mono leading-5"
    >
      {entries.length === 0 && (
        <span className="text-neutral-500">Ожидание запуска pipeline...</span>
      )}
      {entries.map((entry, i) => {
        const phase = phaseLabel(entry.message)
        return (
          <div key={i}>
            {phase && (
              <div className="text-neutral-500 mt-2 mb-1 border-t border-neutral-800 pt-2 text-[10px] uppercase tracking-wider">
                {phase}
              </div>
            )}
            <div className="flex gap-2">
              <span className={cn(statusColor(entry.status))}>{statusSymbol(entry.status)}</span>
              <span className="text-neutral-200">{entry.message}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GenerateProgress({ jobId, onClose }: GenerateProgressProps) {
  const { status, log } = useJobProgress(jobId)
  const isTerminal = status === 'completed' || status === 'failed'

  const repoUrl = log
    .find((e) => e.status === 'completed' && e.message.includes('Repo:'))
    ?.message.match(/Repo:\s*(https?:\/\/\S+)/)?.[1]

  return (
    <Dialog open={!!jobId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Fullstack Generation
            {status && !isTerminal && (
              <span className="text-xs font-normal text-neutral-400 animate-pulse">running...</span>
            )}
            {status === 'completed' && (
              <span className="text-xs font-normal text-green-400">done</span>
            )}
            {status === 'failed' && (
              <span className="text-xs font-normal text-red-400">failed</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <LogViewer entries={log} />
        {repoUrl && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">Repository:</span>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{repoUrl}</a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
