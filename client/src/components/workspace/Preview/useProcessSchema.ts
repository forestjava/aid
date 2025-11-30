import { useState, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import { useERDLayout } from './useERDLayout'
import type { DatabaseSchema } from './types'
import { resolveImports } from '@/components/workspace/Preview/dsl-import-resolver'
import { parseSchema } from '@/components/workspace/Preview/dsl-schema-parser'

interface ProcessSchemaResult {
  nodes: Node[]
  edges: Edge[]
  isProcessing: boolean
}

/**
 * Хук для асинхронной обработки содержимого DSL-файла
 * 
 * Процесс обработки:
 * 1. Резолвинг импортов - заменяет все import на содержимое файлов
 * 2. Парсинг схемы - преобразует DSL в структуру DatabaseSchema
 * 3. Генерация layout - создает nodes и edges для ReactFlow
 */
export const useProcessSchema = (
  content: string | undefined,
  currentFilePath: string = ''
): ProcessSchemaResult => {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!content) {
      setSchema(null)
      setIsProcessing(false)
      return
    }

    setIsProcessing(true)

    // Асинхронная обработка DSL
    const processContent = async () => {
      try {

        // Шаг 1: Резолвинг импортов
        const resolvedResult = await resolveImports(content, currentFilePath);

        if (resolvedResult.error) {
          console.error('Import resolution error:', resolvedResult.error);
        }

        // Шаг 2: Парсинг схемы
        const parsedSchema = await parseSchema(resolvedResult.content);

        if (parsedSchema) {
          setSchema(parsedSchema);
        } else {
          console.log('Schema parsing failed or empty result');
          setSchema(null);
        }
      } catch (error) {
        console.error('DSL processing error:', error);
        setSchema(null);
      } finally {
        setIsProcessing(false);
      }
    };

    processContent();
  }, [content, currentFilePath])

  // Генерация layout из схемы
  const { nodes, edges } = useERDLayout(schema || { entities: [], relations: [] })

  return { nodes, edges, isProcessing }
}

