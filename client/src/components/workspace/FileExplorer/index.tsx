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

export const FileExplorer = () => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedIsDirectory, setSelectedIsDirectory] = useState(false)

  // Диалоги
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createType, setCreateType] = useState<'file' | 'folder'>('file')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const queryClient = useQueryClient()

  // Загрузка корневой директории
  const { data: rootData, isLoading, error } = useQuery({
    queryKey: ['readdir', ''],
    queryFn: () => filesystemApi.readdir(''),
  })

  // Мутация для создания файла
  const createFileMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      filesystemApi.writeFile(path, content),
    onSuccess: () => {
      // Инвалидируем весь кэш дерева файлов
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
    },
  })

  // Мутация для создания папки
  const createFolderMutation = useMutation({
    mutationFn: (path: string) => filesystemApi.mkdir(path),
    onSuccess: () => {
      // Инвалидируем весь кэш дерева файлов
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
    },
  })

  // Мутация для переименования
  const renameMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      filesystemApi.rename(oldPath, newPath),
    onSuccess: (_, variables) => {
      // Инвалидируем весь кэш дерева файлов
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
      // Если переименовали выбранный элемент, обновляем выбранный путь
      if (selectedPath === variables.oldPath) {
        setSelectedPath(variables.newPath)
      }
    },
  })

  // Мутация для удаления
  const deleteMutation = useMutation({
    mutationFn: (path: string) => filesystemApi.rm(path),
    onSuccess: (_, path) => {
      // Инвалидируем весь кэш дерева файлов
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
      // Если удалили выбранный элемент, сбрасываем выбор
      if (selectedPath === path) {
        setSelectedPath(null)
        setSelectedIsDirectory(false)
      }
    },
  })

  // Обработчики

  const handleSelect = (path: string, isDirectory: boolean) => {
    setSelectedPath(path)
    setSelectedIsDirectory(isDirectory)
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
    const basePath = selectedIsDirectory ? selectedPath || '' : ''
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
  const currentPath = selectedIsDirectory ? selectedPath || '' : ''

  return (
    <div className="h-full w-full bg-background border-r flex flex-col">
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
      <div className="flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">Загрузка...</div>
        ) : error ? (
          <div className="px-3 py-2 text-sm text-destructive">
            Ошибка загрузки: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
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
            />
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Нет файлов. Создайте новый файл или папку.
          </div>
        )}
      </div>

      {/* Диалоги */}
      <CreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        type={createType}
        currentPath={currentPath}
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

