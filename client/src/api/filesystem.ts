import type { ReadDirResponse, ReadFileResponse, ExistsResponse } from '@/types/filesystem'

const API_BASE = '/api/fs'

export const filesystemApi = {
  // Получить список файлов и папок в директории
  async readdir(path: string = ''): Promise<ReadDirResponse> {
    const response = await fetch(`${API_BASE}/readdir?path=${encodeURIComponent(path)}`)
    if (!response.ok) {
      throw new Error(`Failed to read directory: ${response.statusText}`)
    }
    return response.json()
  },

  // Получить содержимое файла
  async readFile(path: string): Promise<ReadFileResponse> {
    const response = await fetch(`${API_BASE}/readFile?path=${encodeURIComponent(path)}`)
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`)
    }
    return response.json()
  },

  // Получить информацию о файле/папке
  async stat(path: string) {
    const response = await fetch(`${API_BASE}/stat?path=${encodeURIComponent(path)}`)
    if (!response.ok) {
      throw new Error(`Failed to get file stats: ${response.statusText}`)
    }
    return response.json()
  },

  // Создать новый файл
  async createFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/createFile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, content }),
    })
    if (!response.ok) {
      throw new Error(`Failed to create file: ${response.statusText}`)
    }
    return response.json()
  },

  // Обновить существующий файл
  async updateFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/updateFile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, content }),
    })
    if (!response.ok) {
      throw new Error(`Failed to update file: ${response.statusText}`)
    }
    return response.json()
  },

  // Создать директорию
  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    const response = await fetch(`${API_BASE}/mkdir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, recursive }),
    })
    if (!response.ok) {
      throw new Error(`Failed to create directory: ${response.statusText}`)
    }
    return response.json()
  },

  // Переименовать файл/папку
  async rename(oldPath: string, newPath: string): Promise<void> {
    const response = await fetch(`${API_BASE}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldPath, newPath }),
    })
    if (!response.ok) {
      throw new Error(`Failed to rename: ${response.statusText}`)
    }
    return response.json()
  },

  // Переместить файл/папку
  async move(sourcePath: string, destinationPath: string): Promise<void> {
    const response = await fetch(`${API_BASE}/move`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sourcePath, destinationPath }),
    })
    if (!response.ok) {
      throw new Error(`Failed to move: ${response.statusText}`)
    }
    return response.json()
  },

  // Удалить файл/папку
  async rm(path: string, recursive: boolean = true): Promise<void> {
    const url = new URL(`${API_BASE}/rm`, window.location.origin)
    url.searchParams.set('path', path)
    url.searchParams.set('recursive', String(recursive))

    const response = await fetch(url.toString(), {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete: ${response.statusText}`)
    }
    return response.json()
  },

  // Проверить существование файла/папки
  async exists(path: string): Promise<ExistsResponse> {
    const response = await fetch(`${API_BASE}/exists?path=${encodeURIComponent(path)}`)
    if (!response.ok) {
      throw new Error(`Failed to check existence: ${response.statusText}`)
    }
    return response.json()
  },
}

