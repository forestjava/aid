import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'file' | 'folder'
  currentPath: string
  onConfirm: (name: string) => void
}

export function CreateDialog({
  open,
  onOpenChange,
  type,
  currentPath,
  onConfirm,
}: CreateDialogProps) {
  const [name, setName] = useState('')

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim())
      setName('')
      onOpenChange(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === 'file' ? 'Создать файл' : 'Создать папку'}
          </DialogTitle>
          <DialogDescription>
            {currentPath ? `В папке: ${currentPath}` : 'В корневой папке'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder={type === 'file' ? 'Имя файла' : 'Имя папки'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

