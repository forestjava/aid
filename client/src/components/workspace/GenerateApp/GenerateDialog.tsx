import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface GenerateDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (projectName: string, domain: string) => void
}

export function GenerateDialog({ open, onClose, onSubmit }: GenerateDialogProps) {
  const [projectName, setProjectName] = useState('toir-light-v2')
  const [domain, setDomain] = useState('')

  const handleProjectNameChange = (value: string) => {
    setProjectName(value)
    if (!domain || domain === `${projectName}.greact.ru`) {
      setDomain(`${value}.greact.ru`)
    }
  }

  const handleSubmit = () => {
    if (!projectName.trim() || !domain.trim()) return
    onSubmit(projectName.trim(), domain.trim())
    setProjectName('')
    setDomain('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Fullstack App</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="projectName" className="text-sm font-medium">
              Project Name
            </label>
            <Input
              id="projectName"
              placeholder="my-project"
              value={projectName}
              onChange={(e) => handleProjectNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="domain" className="text-sm font-medium">
              Domain (для NPM proxy)
            </label>
            <Input
              id="domain"
              placeholder="my-project.greact.ru"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!projectName.trim() || !domain.trim()}>Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
