export const FileExplorer = () => {
  return (
    <div className="h-full w-full bg-background border-r flex flex-col">
      <div className="h-10 border-b px-3 flex items-center text-sm font-medium shrink-0">
        FileExplorer
      </div>
      <div className="flex-1 overflow-auto p-3">
        {/* Здесь будет дерево файлов */}
        <p className="text-sm text-muted-foreground">File tree will be here...</p>
      </div>
    </div>
  )
}

