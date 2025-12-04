export interface FileSystemItem {
  name: string
  isFile: boolean
  isDirectory: boolean
}

export interface FileSystemStats {
  path: string
  isFile: boolean
  isDirectory: boolean
  size?: number
  mtime?: string
}

export interface ReadDirResponse {
  path: string
  items: FileSystemItem[]
}

export interface ReadFileResponse {
  path: string
  content: string
}

export interface ExistsResponse {
  path: string
  exists: boolean
  isDirectory?: boolean // присутствует только если exists: true
}

