import { useRef, useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { filesystemApi } from '@/api/filesystem'

interface DragItem {
  path: string
  name: string
  isDirectory: boolean
}

const DRAG_START_DELAY = 200;

export function useDragAndDrop() {
  const queryClient = useQueryClient()
  const dragStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggedItemRef = useRef<DragItem | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

  // Мутация для перемещения файла/папки
  const moveMutation = useMutation({
    mutationFn: ({ sourcePath, destinationPath }: { sourcePath: string; destinationPath: string }) =>
      filesystemApi.move(sourcePath, destinationPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readdir'] })
    },
  })

  // Очистка таймера
  const clearDragTimer = useCallback(() => {
    if (dragStartTimerRef.current) {
      clearTimeout(dragStartTimerRef.current)
      dragStartTimerRef.current = null
    }
  }, [])

  // Обработчик mousedown - начало отсчёта для drag
  const handleMouseDown = useCallback(
    (item: DragItem, element: HTMLElement) => {
      clearDragTimer()

      // Запускаем таймер на DRAG_START_DELAY ms
      dragStartTimerRef.current = setTimeout(() => {
        // После DRAG_START_DELAY ms разрешаем draggable
        element.setAttribute('draggable', 'true')
        draggedItemRef.current = item

        // Добавляем визуальное выделение
        element.classList.add('drag-ready')
        element.style.outline = '2px solid rgb(59, 130, 246)'
        element.style.outlineOffset = '-2px'
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
      }, DRAG_START_DELAY)
    },
    [clearDragTimer]
  )

  // Обработчик mouseup - ЕДИНСТВЕННОЕ место отмены таймера
  const handleMouseUp = useCallback(
    (element: HTMLElement) => {
      clearDragTimer()
      element.setAttribute('draggable', 'false')

      // Убираем визуальное выделение
      element.classList.remove('drag-ready')
      element.style.outline = ''
      element.style.outlineOffset = ''
      element.style.backgroundColor = ''
    },
    [clearDragTimer]
  )

  // Обработчик mousemove - не отменяет таймер, разрешаем движение мыши
  const handleMouseMove = useCallback(
    (_element: HTMLElement) => {
      // Ничего не делаем, разрешаем пользователю двигать мышь
      // Таймер отменяется только в handleMouseUp
    },
    []
  )

  // Обработчик dragstart - начало перетаскивания
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    e.stopPropagation()
    draggedItemRef.current = item
    setIsDragging(true)

    // Устанавливаем данные для переноса
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify(item))

    // Добавляем визуальный эффект
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  // Обработчик dragend - конец перетаскивания
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    setIsDragging(false)
    setDragOverPath(null)
    draggedItemRef.current = null

    // Восстанавливаем визуал
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
      e.currentTarget.setAttribute('draggable', 'false')

      // Убираем визуальное выделение
      e.currentTarget.classList.remove('drag-ready')
      e.currentTarget.style.outline = ''
      e.currentTarget.style.outlineOffset = ''
      e.currentTarget.style.backgroundColor = ''
    }
  }, [])

  // Обработчик dragover - наведение на цель
  const handleDragOver = useCallback((e: React.DragEvent, targetPath: string, targetIsDirectory: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'

    // Подсвечиваем только папки, но разрешаем drop на всё
    if (targetIsDirectory) {
      setDragOverPath(targetPath)
    }
  }, [])

  // Обработчик dragleave - покидаем цель
  const handleDragLeave = useCallback((e: React.DragEvent, targetPath: string) => {
    e.stopPropagation()
    if (dragOverPath === targetPath) {
      setDragOverPath(null)
    }
  }, [dragOverPath])

  // Обработчик drop - сброс на цель
  const handleDrop = useCallback(
    (e: React.DragEvent, targetPath: string, targetIsDirectory: boolean) => {
      e.preventDefault()
      e.stopPropagation()

      setDragOverPath(null)

      const draggedItem = draggedItemRef.current
      if (!draggedItem) {
        return
      }

      // Определяем целевую папку
      // Если target - папка, используем её путь
      // Если target - файл, используем путь его родительской папки
      let destinationFolderPath = targetPath
      if (!targetIsDirectory) {
        // Для файла берём родительскую папку
        const pathParts = targetPath.split('/')
        destinationFolderPath = pathParts.slice(0, -1).join('/')
      }

      // Валидация: нельзя перетащить элемент в самого себя
      if (draggedItem.path === destinationFolderPath) {
        console.warn('Cannot move item into itself')
        return
      }

      // Валидация: нельзя перетащить папку в свою подпапку
      if (destinationFolderPath.startsWith(draggedItem.path + '/')) {
        console.warn('Cannot move folder into its subfolder')
        return
      }

      // Валидация: проверяем, не находится ли элемент уже в целевой папке
      const sourceParentPath = draggedItem.path.split('/').slice(0, -1).join('/')
      if (sourceParentPath === destinationFolderPath) {
        console.warn('Item already in target folder')
        return
      }

      // Формируем путь назначения
      const destinationPath = destinationFolderPath
        ? `${destinationFolderPath}/${draggedItem.name}`
        : draggedItem.name

      // Выполняем перемещение
      moveMutation.mutate({
        sourcePath: draggedItem.path,
        destinationPath,
      })
    },
    [moveMutation]
  )

  return {
    isDragging,
    dragOverPath,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}

