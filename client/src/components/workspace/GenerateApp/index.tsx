import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GenerateDialog } from './GenerateDialog'
import { GenerateProgress } from './GenerateProgress'
import { startGeneration } from '@/api/generate'

interface GenerateAppProps {
  dslPath: string | null
}

export function GenerateApp({ dslPath }: GenerateAppProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const handleSubmit = async (projectName: string, domain: string) => {
    if (!dslPath) return
    setDialogOpen(false)
    const jobId = await startGeneration({ projectName, domain, dslPath })
    if (jobId) setActiveJobId(jobId)
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-7 text-xs gap-1.5 cursor-pointer"
        disabled={!dslPath}
        onClick={() => setDialogOpen(true)}
      >
        <Rocket className="h-3.5 w-3.5" />
        GENERATE
      </Button>
      <GenerateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleSubmit} />
      <GenerateProgress jobId={activeJobId} onClose={() => setActiveJobId(null)} />
    </>
  )
}
