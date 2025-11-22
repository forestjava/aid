export const Preview = () => {
  return (
    <div className="h-full w-full bg-background border-l flex flex-col">
      <div className="h-10 border-b px-3 flex items-center text-sm font-medium shrink-0">
        Viewer
      </div>
      <div className="flex-1 overflow-auto p-4">
        {/* Здесь будет превью/документация */}
        <p className="text-sm text-muted-foreground">Documentation preview will be here...</p>
      </div>
    </div>
  )
}

