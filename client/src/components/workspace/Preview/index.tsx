import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactFlow, {
  Background,
  Controls,
  type NodeTypes,
  useNodesState,
  useEdgesState,
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

export const Preview: React.FC<PreviewProps> = ({ currentFile }) => {
  // Загрузка содержимого файла
  const { data: fileData, isLoading } = useQuery({
    queryKey: ['readFile', currentFile],
    queryFn: () => filesystemApi.readFile(currentFile!),
    enabled: !!currentFile,
  })

  // Асинхронная обработка содержимого файла в схему и layout
  const { nodes, edges, isProcessing } = useProcessSchema(fileData?.content, currentFile || '')

  // Локальное состояние для возможности перемещения узлов
  const [previewNodes, setNodes, onNodesChange] = useNodesState([])
  const [previewEdges, setEdges, onEdgesChange] = useEdgesState([])

  // Синхронизируем с данными из useProcessSchema
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
          <ReactFlow
            nodes={previewNodes}
            edges={previewEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
