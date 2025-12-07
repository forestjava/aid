import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePlus, FolderPlus } from 'lucide-react'
import { filesystemApi } from '@/api/filesystem'
import { sortFileSystemItems } from '@/lib/sortFileSystemItems'
import { FileTreeItem } from './FileTreeItem'
import { CreateDialog } from './CreateDialog'
import { RenameDialog } from './RenameDialog'
import { DeleteDialog } from './DeleteDialog'
import { Button } from '@/components/ui/button'
import { useDragAndDrop } from './useDragAndDrop'
import { cn } from '@/lib/utils'

interface FileExplorerProps {
  onSelect?: (path: string, isDirectory: boolean) => void
  selectedPath: string | null // Полностью управляемый компонент
  selectedIsDirectory: boolean // Полностью управляемый компонент
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  onSelect,
  selectedPath,
  selectedIsDirectory
}) => {
  // Компонент теперь полностью управляемый, состояния приходят извне

  // Диалоги
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createType, setCreateType] = useState<'file' | 'folder'>('file')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const queryClient = useQueryClient();

  // Drag and Drop
  const dragAndDrop = useDragAndDrop();

  // Загрузка корневой директории
  const { data: rootData, isLoading } = useQuery({
    queryKey: ['readdir', ''],
    queryFn: () => filesystemApi.readdir(''),
  });

  // Мутация для создания файла
  const createFileMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      filesystemApi.createFile(path, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
    },
  });

  // Мутация для создания папки
  const createFolderMutation = useMutation({
    mutationFn: (path: string) => filesystemApi.mkdir(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
    },
  });

  // Мутация для переименования
  const renameMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      filesystemApi.rename(oldPath, newPath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
      // Если переименовали выбранный элемент, уведомляем родителя
      if (selectedPath === variables.oldPath && onSelect) {
        onSelect(variables.newPath, selectedIsDirectory)
      }
    },
  });

  // Мутация для удаления
  const deleteMutation = useMutation({
    mutationFn: (path: string) => filesystemApi.rm(path),
    onSuccess: (_, deletedPath) => {
      queryClient.invalidateQueries({ queryKey: ['readdir'] })

      // Если удалили выбранный элемент, редиректим на родительскую папку
      if (selectedPath === deletedPath && onSelect) {
        // Извлекаем родительский путь
        const pathParts = deletedPath.split('/')
        const parentPath = pathParts.length > 1
          ? pathParts.slice(0, -1).join('/')  // "Demo/users" -> "Demo"
          : ''                                 // "example" -> "" (корень)

        onSelect(parentPath, true)
      }
    },
  });

  // Обработчики

  const handleSelect = (path: string, isDirectory: boolean) => {
    // Просто уведомляем родительский компонент
    // Родитель обновит URL, который вернётся обратно через пропы
    if (onSelect) {
      onSelect(path, isDirectory)
    }
  }

  const handleCreateFile = () => {
    setCreateType('file')
    setCreateDialogOpen(true)
  }

  const handleCreateFolder = () => {
    setCreateType('folder')
    setCreateDialogOpen(true)
  }

  const handleConfirmCreate = (name: string) => {
    let basePath = ''

    if (selectedPath) {
      if (selectedIsDirectory) {
        // Если выбрана папка, используем её путь
        basePath = selectedPath
      } else {
        // Если выбран файл, используем путь к родительской папке
        const pathParts = selectedPath.split('/')
        basePath = pathParts.slice(0, -1).join('/')
      }
    }

    const fullPath = basePath ? `${basePath}/${name}` : name

    if (createType === 'file') {
      createFileMutation.mutate({ path: fullPath, content: '' })
    } else {
      createFolderMutation.mutate(fullPath)
    }
  }

  const handleRename = (path: string, currentName: string) => {
    setRenameTarget({ path, name: currentName })
    setRenameDialogOpen(true)
  }

  const handleConfirmRename = (newName: string) => {
    if (renameTarget) {
      const parentPath = renameTarget.path.split('/').slice(0, -1).join('/')
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      renameMutation.mutate({ oldPath: renameTarget.path, newPath })
    }
  }

  const handleDelete = (path: string) => {
    setDeleteTarget(path)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget)
    }
  }

  // Определяем текущий путь для диалога создания
  const dialogBasePath = selectedPath
    ? (selectedIsDirectory ? selectedPath : selectedPath.split('/').slice(0, -1).join('/'))
    : ''

  return (
    <div className="h-full w-full bg-background border-r flex flex-col select-none">
      {/* Заголовок с кнопками создания */}
      <div className="h-10 border-b px-2 flex items-center justify-between shrink-0">
        <span className="text-sm font-medium">Файлы описания</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreateFile}
            title="Создать файл"
            className="h-7 w-7 p-0"
          >
            <FilePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreateFolder}
            title="Создать папку"
            className="h-7 w-7 p-0"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Дерево файлов */}
      <div className="flex-1 overflow-auto py-2 flex flex-col">
        <div className="flex-shrink-0">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Загрузка...</div>
          ) : rootData?.items && rootData.items.length > 0 ? (
            sortFileSystemItems(rootData.items).map((item) => (
              <FileTreeItem
                key={item.name}
                item={item}
                path=""
                level={0}
                selectedPath={selectedPath}
                onSelect={handleSelect}
                onRename={handleRename}
                onDelete={handleDelete}
                dragOverPath={dragAndDrop.dragOverPath}
                onDragStart={(e, path, name, isDirectory) =>
                  dragAndDrop.handleDragStart(e, { path, name, isDirectory })
                }
                onDragEnd={dragAndDrop.handleDragEnd}
                onDragOver={dragAndDrop.handleDragOver}
                onDragLeave={dragAndDrop.handleDragLeave}
                onDrop={dragAndDrop.handleDrop}
                onMouseDown={(path, name, isDirectory, element) =>
                  dragAndDrop.handleMouseDown({ path, name, isDirectory }, element)
                }
              />
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Нет файлов. Создайте новый файл или папку.
            </div>
          )}
        </div>

        {/* Drop-зона для перемещения в корневой каталог */}
        {dragAndDrop.isDragging && (
          <div
            className={cn(
              "flex-1 min-h-[60px] mx-2 mt-2 rounded border-2 border-dashed transition-colors",
              dragAndDrop.dragOverPath === ''
                ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30"
                : "border-muted-foreground/20"
            )}
            onDragOver={(e) => dragAndDrop.handleDragOver(e, '', true)}
            onDragLeave={(e) => dragAndDrop.handleDragLeave(e, '')}
            onDrop={(e) => dragAndDrop.handleDrop(e, '', true)}
          />
        )}
      </div>

      {/* Диалоги */}
      <CreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        type={createType}
        currentPath={dialogBasePath}
        onConfirm={handleConfirmCreate}
      />

      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        currentName={renameTarget?.name || ''}
        onConfirm={handleConfirmRename}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemPath={deleteTarget || ''}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

