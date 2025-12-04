import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Layout } from '@/components/layout/Layout'
import { Header } from '@/components/layout/Header'
import { Main } from '@/components/layout/Main'
import { Footer } from '@/components/layout/Footer'
import { FileExplorer } from '@/components/workspace/FileExplorer'
import { Editor } from '@/components/workspace/Editor'
import { Preview } from '@/components/workspace/Preview'
import { filesystemApi } from '@/api/filesystem'

export const App = () => {
  const navigate = useNavigate()
  const location = useLocation()

  // Извлекаем путь из URL
  // location.pathname будет "/" → selectedPath = null
  // location.pathname будет "/Demo/users" → selectedPath = "Demo/users"
  // location.pathname будет "/Demo" → selectedPath = "Demo"
  // Явно декодируем путь для поддержки кириллицы и спецсимволов
  const selectedPath = location.pathname === '/' 
    ? null 
    : decodeURIComponent(location.pathname.slice(1))

  // Состояние для текущего файла (только файл, не папка)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [selectedIsDirectory, setSelectedIsDirectory] = useState(false)
  const [validationChecked, setValidationChecked] = useState(false)

  // Валидация пути при прямом переходе по URL
  const { data: pathInfo, isLoading: isValidating } = useQuery({
    queryKey: ['validatePath', selectedPath],
    queryFn: async () => {
      if (!selectedPath) return { exists: true, isDirectory: false }
      
      // Используем обновленный API exists, который возвращает isDirectory
      const existsResult = await filesystemApi.exists(selectedPath)
      if (!existsResult.exists) {
        return { exists: false, isDirectory: false }
      }

      // isDirectory уже есть в ответе exists
      return { 
        exists: true, 
        isDirectory: existsResult.isDirectory ?? false 
      }
    },
    enabled: !!selectedPath,
    retry: false,
    staleTime: 0, // Всегда проверяем при переходе
  })

  // Обработка результата валидации
  useEffect(() => {
    if (!selectedPath) {
      setCurrentFile(null)
      setSelectedIsDirectory(false)
      setValidationChecked(true)
      return
    }

    if (!isValidating && pathInfo) {
      if (!pathInfo.exists) {
        // Путь не существует - редирект на главную
        toast.error('Путь не найден', {
          description: `"${selectedPath}" не существует`,
        })
        navigate('/', { replace: true })
        setCurrentFile(null)
        setSelectedIsDirectory(false)
        setValidationChecked(true)
      } else if (!pathInfo.isDirectory) {
        // Это файл - устанавливаем его как текущий для редактора
        setCurrentFile(selectedPath)
        setSelectedIsDirectory(false)
        setValidationChecked(true)
      } else {
        // Это папка - не устанавливаем currentFile, но selectedPath остаётся
        setCurrentFile(null)
        setSelectedIsDirectory(true)
        setValidationChecked(true)
      }
    }
  }, [selectedPath, pathInfo, isValidating, navigate])

  // Обработчик выбора из FileExplorer
  const handleSelect = (path: string, _isDirectory: boolean) => {
    // Обновляем URL для любого выбора (файл или папка)
    navigate(`/${path}`)
    // Состояние обновится через валидацию URL
  }

  // Показываем loader пока проверяем валидацию
  if (selectedPath && !validationChecked) {
    return (
      <Layout>
        <Header>Система управления документацией</Header>
        <Main>
          <FileExplorer 
            onSelect={handleSelect} 
            selectedPath={selectedPath}
            selectedIsDirectory={selectedIsDirectory}
          />
          <div className="flex items-center justify-center w-full h-full">
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          </div>
          <div className="flex items-center justify-center w-full h-full">
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          </div>
        </Main>
        <Footer>© 2025 ОЭЗ Алабуга</Footer>
      </Layout>
    )
  }

  return (
    <Layout>
      <Header>Система управления документацией</Header>
      <Main>
        <FileExplorer 
          onSelect={handleSelect}
          selectedPath={selectedPath}
          selectedIsDirectory={selectedIsDirectory}
        />
        <Editor currentFile={currentFile} />
        <Preview currentFile={currentFile} />
      </Main>
      <Footer>© 2025 ОЭЗ Алабуга</Footer>
    </Layout>
  )
}
