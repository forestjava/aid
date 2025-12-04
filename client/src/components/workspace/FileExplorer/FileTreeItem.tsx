import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, File, Folder, MoreVertical } from 'lucide-react'
import { filesystemApi } from '@/api/filesystem'
import { sortFileSystemItems } from '@/lib/sortFileSystemItems'
import type { FileSystemItem } from '@/types/filesystem'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FileTreeItemProps {
  item: FileSystemItem
  path: string
  level: number
  selectedPath: string | null
  onSelect: (path: string, isDirectory: boolean) => void
  onRename: (path: string, name: string) => void
  onDelete: (path: string) => void
}

export function FileTreeItem({
  item,
  path,
  level,
  selectedPath,
  onSelect,
  onRename,
  onDelete,
}: FileTreeItemProps) {
  const fullPath = path ? `${path}/${item.name}` : item.name
  const isSelected = selectedPath === fullPath
  
  // Проверяем, является ли эта папка родительской для selectedPath
  const isParentOfSelected = selectedPath?.startsWith(`${fullPath}/`) ?? false
  
  const [isExpanded, setIsExpanded] = useState(isParentOfSelected)

  // Автоматически разворачиваем папку, если она содержит выбранный путь
  useEffect(() => {
    if (item.isDirectory && isParentOfSelected && !isExpanded) {
      setIsExpanded(true)
    }
  }, [isParentOfSelected, isExpanded, item.isDirectory])

  // Загружаем содержимое папки только когда она раскрыта
  const { data, isLoading } = useQuery({
    queryKey: ['readdir', fullPath],
    queryFn: () => filesystemApi.readdir(fullPath),
    enabled: item.isDirectory && isExpanded,
  })

  const handleToggle = () => {
    if (item.isDirectory) {
      setIsExpanded(!isExpanded)
      if (!isExpanded) {
        onSelect(fullPath, true)
      }
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(fullPath, item.isDirectory)
    if (item.isDirectory) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleMenuAction = (e: React.MouseEvent, action: 'rename' | 'delete') => {
    e.stopPropagation()
    if (action === 'rename') {
      onRename(fullPath, item.name)
    } else if (action === 'delete') {
      onDelete(fullPath)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 py-1 px-2 hover:bg-accent rounded-sm cursor-pointer text-sm',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {/* Кнопка разворачивания для папок */}
        {item.isDirectory ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggle()
            }}
            className="shrink-0 p-0.5 hover:bg-accent-foreground/10 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="w-5 shrink-0" />
        )}

        {/* Иконка файла/папки */}
        {item.isDirectory ? (
          <Folder className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-gray-500" />
        )}

        {/* Имя файла/папки */}
        <span className="flex-1 truncate">{item.name}</span>

        {/* Контекстное меню */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => handleMenuAction(e, 'rename')}>
              Переименовать
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => handleMenuAction(e, 'delete')}
              className="text-destructive"
            >
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Рекурсивное отображение вложенных элементов */}
      {item.isDirectory && isExpanded && (
        <div>
          {isLoading ? (
            <div
              className="py-1 px-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              Загрузка...
            </div>
          ) : data?.items && data.items.length > 0 ? (
            sortFileSystemItems(data.items).map((childItem) => (
              <FileTreeItem
                key={childItem.name}
                item={childItem}
                path={fullPath}
                level={level + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          ) : (
            <div
              className="py-1 px-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              Пусто
            </div>
          )}
        </div>
      )}
    </div>
  )
}

