import type { FileSystemItem } from '@/types/filesystem'

/**
 * Сортирует элементы файловой системы:
 * 1. Сначала все директории (по алфавиту)
 * 2. Потом все файлы (по алфавиту)
 */
export function sortFileSystemItems(items: FileSystemItem[]): FileSystemItem[] {
  return [...items].sort((a, b) => {
    // Если один элемент - директория, а другой - файл
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    
    // Если оба одного типа - сортируем по имени
    return a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
  })
}

