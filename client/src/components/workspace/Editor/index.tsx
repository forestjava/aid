export const Editor = () => {
  return (
    <div className="h-full w-full bg-background flex flex-col">
      <div className="h-10 border-b px-3 flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium">Editor</span>
        <span className="text-xs text-muted-foreground">• No file selected</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {/* Здесь будет редактор кода */}
        <p className="text-sm text-muted-foreground">Code editor will be here...</p>
      </div>
    </div>
  )
}

