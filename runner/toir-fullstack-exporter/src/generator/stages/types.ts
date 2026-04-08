export interface FileEntry {
  /** Repo-relative path. */
  path: string;
  content: string;
}

export interface StageResult {
  files: FileEntry[];
}
