import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { filesystemApi } from '@/api/filesystem'
import { Button } from '@/components/ui/button'
import { CodeEditor } from './CodeEditor'

interface EditorProps {
  currentFile: string | null  // файл, который нужно открыть (приходит извне)
}

export const Editor: React.FC<EditorProps> = ({ currentFile: setFile }) => {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const queryClient = useQueryClient()

  // Загрузка содержимого файла
  const { data: fileData, isLoading } = useQuery({
    queryKey: ['readFile', currentFile],
    queryFn: () => filesystemApi.readFile(currentFile!),
    enabled: !!currentFile,
  })

  // Мутация для сохранения файла
  const saveMutation = useMutation({
    mutationFn: (content: string) =>
      filesystemApi.updateFile(currentFile!, content),
    onSuccess: () => {
      setHasChanges(false)
      queryClient.invalidateQueries({ queryKey: ['readFile', currentFile] })
    },
  })

  // переключение текущего файла с автосохранением
  useEffect(() => {
    // Если пришёл новый файл извне и он отличается от текущего
    if (setFile !== currentFile) {
      // Если есть несохранённые изменения в текущем файле
      if (hasChanges && currentFile) {
        // Автоматически сохраняем текущий файл, затем переключаемся на новый файл
        saveMutation.mutate(content, { onSuccess: () => setCurrentFile(setFile) });
      } else {
        // Если изменений нет, просто переключаемся на новый файл
        setCurrentFile(setFile)
      }
    }
  }, [setFile])

  // Обновляем локальное содержимое при загрузке нового файла
  useEffect(() => {
    if (fileData?.content !== undefined) {
      setContent(fileData.content)
      setHasChanges(false)
    }
  }, [fileData?.content])

  // Сброс состояния при смене файла
  useEffect(() => {
    if (!currentFile) {
      setContent('')
      setHasChanges(false)
    }
  }, [currentFile])

  const handleContentChange = (newValue: string) => {
    setContent(newValue)
    setHasChanges(true)
  }

  const handleSave = () => {
    if (currentFile && hasChanges) {
      saveMutation.mutate(content)
    }
  }

  return (
    <div className="h-full w-full bg-background flex flex-col">
      {/* Заголовок */}
      <div className="h-10 border-b px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">Редактор</span>
          {currentFile ? (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground truncate">
                {currentFile}
              </span>
              {hasChanges && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-orange-500">Изменён</span>
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">• Файл не выбран</span>
          )}
        </div>

        {currentFile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            title={saveMutation.isPending ? 'Сохранение...' : 'Сохранить файл'}
            className="h-7 w-7 p-0"
          >
            <Save className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Область редактирования */}
      {!currentFile ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Выберите файл в файловом менеджере для редактирования
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Загрузка файла...</p>
        </div>
      ) : (
        // <Textarea /> from @/components/ui/textarea        
        <CodeEditor
          value={content}
          onChange={handleContentChange}
        />
      )}
    </div>
  )
}
