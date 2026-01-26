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
import type { DatabaseSchema } from './types'

interface ExportMenuProps {
  schema: DatabaseSchema | null
}

/**
 * Рекурсивный рендер элементов меню
 * Поддерживает вложенные подменю через children
 */
const renderMenuItem = (
  item: ExportMenuItem,
  schema: DatabaseSchema | null
): React.ReactNode => {
  // Если есть дочерние элементы - рендерим подменю
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
          {item.children.map((child) => renderMenuItem(child, schema))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  // Иначе рендерим обычный элемент меню
  return (
    <DropdownMenuItem
      key={item.id}
      className="text-xs"
      disabled={item.disabled || !schema}
      onClick={() => {
        if (item.action && schema) {
          item.action(schema)
        }
      }}
    >
      {item.icon && <item.icon className="mr-2 h-4 w-4" />}
      {item.label}
    </DropdownMenuItem>
  )
}

/**
 * Компонент меню экспорта схемы
 * Отображает иерархическое выпадающее меню с опциями экспорта
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({ schema }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-7 text-xs gap-1.5"
          disabled={!schema}
        >
          <Download className="h-3.5 w-3.5" />
          EXPORT
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {exportMenuConfig.map((item) => renderMenuItem(item, schema))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
