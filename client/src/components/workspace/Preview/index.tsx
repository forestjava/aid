import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { filesystemApi } from '@/api/filesystem'
import EntityNode from './EntityNode'
import { useProcessSchema } from './useProcessSchema'

interface PreviewProps {
  currentFile: string | null // файл, который нужно открыть (приходит извне)
}

const nodeTypes: NodeTypes = {
  entity: EntityNode,
}

// Внутренний компонент для автоматического fitView
const AutoFitView: React.FC<{ currentFile: string | null, nodes: Node[] }> = ({ currentFile, nodes }) => {
  const reactFlowInstance = useReactFlow()

  // fitView при изменении currentFile
  useEffect(() => {
    if (nodes.length > 0) {
      // Небольшая задержка для завершения рендера
      setTimeout(() => {
        reactFlowInstance.fitView({ duration: 200 })
      }, 200)
    }
  }, [currentFile, nodes.length, reactFlowInstance])

  // fitView при изменении размера контейнера (например, при ресайзе панели)
  useEffect(() => {
    const container = document.querySelector('.react-flow')
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      if (nodes.length > 0) {
        reactFlowInstance.fitView({ duration: 200 })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [nodes.length, reactFlowInstance])

  return null
}

export const Preview: React.FC<PreviewProps> = ({ currentFile }) => {
  // Шаг 1: Получение контента текущего файла
  const { data: fileData, isLoading } = useQuery({
    queryKey: ['readFile', currentFile],
    queryFn: () => filesystemApi.readFile(currentFile!),
    enabled: !!currentFile,
  })

  // Шаги 2-5: Асинхронная обработка содержимого файла (резолвинг, парсинг, размеры, layout)
  const { nodes, edges, isProcessing } = useProcessSchema(fileData?.content, currentFile || '')

  // Локальное состояние для возможности перемещения узлов
  const [previewNodes, setNodes, onNodesChange] = useNodesState([])
  const [previewEdges, setEdges, onEdgesChange] = useEdgesState([])

  // Синхронизируем с данными из useProcessSchema для рендера (Шаг 6)
  useEffect(() => {
    setNodes(nodes)
  }, [nodes, setNodes])

  useEffect(() => {
    setEdges(edges)
  }, [edges, setEdges])

  return (
    <div className="h-full w-full bg-background border-l flex flex-col">
      {/* Заголовок */}
      <div className="h-10 border-b px-3 flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-sm font-medium">Схема</span>
        {currentFile ? (
          <>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground truncate" title={currentFile}>
              {currentFile}
            </span>
            {(isLoading || isProcessing) && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-blue-500">
                  {isLoading ? 'Загрузка...' : 'Обработка...'}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">• Файл не выбран</span>
        )}
      </div>

      {/* Область схемы */}
      {!currentFile ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Выберите файл в файловом менеджере для просмотра схемы
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Загрузка файла...</p>
        </div>
      ) : isProcessing ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Обработка схемы...</p>
        </div>
      ) : (
        <div className="flex-1 relative">
          {/* Шаг 6: Рендер компонента ReactFlow с узлами и связями */}
          <ReactFlow
            nodes={previewNodes}
            edges={previewEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
          >
            <Background />
            <Controls />
            <AutoFitView currentFile={currentFile} nodes={previewNodes} />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
