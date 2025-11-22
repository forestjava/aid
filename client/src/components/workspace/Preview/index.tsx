interface PreviewProps {
  currentFile: string | null
}

export const Preview: React.FC<PreviewProps> = ({ currentFile }) => {
  return (
    <div className="h-full w-full bg-background border-l flex flex-col">
      <div className="h-10 border-b px-3 flex items-center text-sm font-medium shrink-0">
        Схема
      </div>
      <div className="flex-1 overflow-auto p-4">
        {/* Здесь будет превью/документация */}
        <p className="text-sm text-muted-foreground">Documentation preview of {currentFile} will be here...</p>
      </div>
    </div>
  )
}

