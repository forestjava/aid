import { useState, useEffect } from 'react'
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

interface RenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName: string
  onConfirm: (newName: string) => void
}

export function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (open) {
      setName(currentName)
    }
  }, [open, currentName])

  const handleConfirm = () => {
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim())
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
          <DialogTitle>Переименовать</DialogTitle>
          <DialogDescription>Текущее имя: {currentName}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Новое имя"
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
          <Button
            onClick={handleConfirm}
            disabled={!name.trim() || name === currentName}
          >
            Переименовать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

