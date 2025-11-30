import { useState, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import { useERDLayout } from './useERDLayout'
import { testSchema, type DatabaseSchema } from './types'

interface ProcessSchemaResult {
  nodes: Node[]
  edges: Edge[]
  isProcessing: boolean
}

/**
 * Хук для асинхронной обработки содержимого DSL-файла
 * Парсит содержимое в схему БД и генерирует layout для диаграммы
 */
export const useProcessSchema = (content: string | undefined): ProcessSchemaResult => {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!content) {
      setSchema(null)
      setIsProcessing(false)
      return
    }

    setIsProcessing(true)
    
    // Имитация асинхронной обработки с задержкой 1 секунда
    // В будущем здесь будет:
    // 1. Парсинг DSL-файла
    // 2. Валидация схемы
    // 3. Построение графа зависимостей
    const timer = setTimeout(() => {
      // Пока всегда возвращаем мок-данные
      setSchema(testSchema)
      setIsProcessing(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [content])

  // Генерация layout из схемы
  const { nodes, edges } = useERDLayout(schema || { entities: [], relations: [] })

  return { nodes, edges, isProcessing }
}

