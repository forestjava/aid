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
        console.log('=== Starting DSL processing ===');
        console.log('File path:', currentFilePath || '(root)');
        console.log('Content length:', content.length);

        // Шаг 1: Резолвинг импортов
        console.log('Step 1: Resolving imports...');
        const resolvedResult = await resolveImports(content, currentFilePath);

        if (resolvedResult.error) {
          console.error('Import resolution error:', resolvedResult.error);
        }

        console.log('Resolved content length:', resolvedResult.content.length);

        // Шаг 2: Парсинг схемы
        console.log('Step 2: Parsing schema...');
        const parsedSchema = await parseSchema(resolvedResult.content);

        if (parsedSchema) {
          console.log('Schema parsed successfully');
          console.log('Entities:', parsedSchema.entities.length);
          console.log('Relations:', parsedSchema.relations.length);
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

