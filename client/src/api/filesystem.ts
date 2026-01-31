import type { ReadDirResponse, ReadFileResponse, ExistsResponse } from '@/types/filesystem'

const API_BASE = '/api/fs'

/**
 * Извлекает сообщение об ошибке из ответа сервера.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body && typeof body.message === 'string') {
      return body.message
    }
  } finally {
    // Не удалось распарсить JSON -> return response.statusText
  }
  return response.statusText
}

/**
 * Проверяет ответ и выбрасывает ошибку если он не ok.
 */
async function validate(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }
}

export const filesystemApi = {
  async readdir(path: string = ''): Promise<ReadDirResponse> {
    const response = await fetch(`${API_BASE}/readdir?path=${encodeURIComponent(path)}`)
    await validate(response)
    return response.json()
  },

  async readFile(path: string): Promise<ReadFileResponse> {
    const response = await fetch(`${API_BASE}/readFile?path=${encodeURIComponent(path)}`)
    await validate(response)
    return response.json()
  },

  async stat(path: string) {
    const response = await fetch(`${API_BASE}/stat?path=${encodeURIComponent(path)}`)
    await validate(response)
    return response.json()
  },

  async createFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/createFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    await validate(response)
    return response.json()
  },

  async updateFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/updateFile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    await validate(response)
    return response.json()
  },

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    const response = await fetch(`${API_BASE}/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, recursive }),
    })
    await validate(response)
    return response.json()
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    const response = await fetch(`${API_BASE}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    })
    await validate(response)
    return response.json()
  },

  async move(sourcePath: string, destinationPath: string): Promise<void> {
    const response = await fetch(`${API_BASE}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, destinationPath }),
    })
    await validate(response)
    return response.json()
  },

  async rm(path: string, recursive: boolean = true): Promise<void> {
    const url = new URL(`${API_BASE}/rm`, window.location.origin)
    url.searchParams.set('path', path)
    url.searchParams.set('recursive', String(recursive))

    const response = await fetch(url.toString(), { method: 'DELETE' })
    await validate(response)
    return response.json()
  },

  async exists(path: string): Promise<ExistsResponse> {
    const response = await fetch(`${API_BASE}/exists?path=${encodeURIComponent(path)}`)
    await validate(response)
    return response.json()
  },
}

// API для парсинга DSL файлов
const PARSE_API_BASE = '/api/parse'

/**
 * Результат навигации по ref-ссылке
 */
export interface NavigateResponse {
  path: string | null
  position?: { line: number; column: number }
  error?: string
}

export const parseApi = {
  async parseText(path: string): Promise<{ path: string; content: string }> {
    const response = await fetch(`${PARSE_API_BASE}/text?path=${encodeURIComponent(path)}`)
    await validate(response)
    return response.json()
  },

  async navigate(ref: string, source: string): Promise<NavigateResponse> {
    const url = new URL(`${PARSE_API_BASE}/navigate`, window.location.origin)
    url.searchParams.set('ref', ref)
    url.searchParams.set('source', source)
    const response = await fetch(url.toString())
    await validate(response)
    return response.json()
  },
}

