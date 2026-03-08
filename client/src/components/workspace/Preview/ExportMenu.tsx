import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportMenuConfig, type ExportMenuItem } from '@/lib/export-config'
import { ExportJobDialog } from './ExportJobDialog'

interface ExportMenuProps {
  path: string | null
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ path }) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const handleAction = async (item: ExportMenuItem) => {
    if (!item.action || !path) return
    const result = await item.action(path)
    if (typeof result === 'string') {
      setActiveJobId(result)
    }
  }

  const renderMenuItem = (item: ExportMenuItem): React.ReactNode => {
    if (item.children && item.children.length > 0) {
      return (
        <DropdownMenuSub key={item.id}>
          <DropdownMenuSubTrigger
            className="text-xs"
            disabled={item.disabled}
          >
            {item.icon && <item.icon className="mr-2 h-4 w-4" />}
            {item.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {item.children.map((child) => renderMenuItem(child))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }

    return (
      <DropdownMenuItem
        key={item.id}
        className="text-xs"
        disabled={item.disabled || !path}
        onClick={() => handleAction(item)}
      >
        {item.icon && <item.icon className="mr-2 h-4 w-4" />}
        {item.label}
      </DropdownMenuItem>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-7 text-xs gap-1.5 cursor-pointer"
            disabled={!path}
          >
            <Download className="h-3.5 w-3.5" />
            EXPORT
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {exportMenuConfig.map((item) => renderMenuItem(item))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportJobDialog
        jobId={activeJobId}
        onClose={() => setActiveJobId(null)}
      />
    </>
  )
}
