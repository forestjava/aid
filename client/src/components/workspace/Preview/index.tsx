import { useEffect, useMemo, useState } from 'react'
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
import { Check, ChevronsUpDown } from 'lucide-react'

import { filesystemApi } from '@/api/filesystem'
import EntityNode from './EntityNode'
import { useProcessSchema } from './useProcessSchema'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface PreviewProps {
  currentFile: string | null // файл, который нужно открыть (приходит извне)
}

// Внутренний компонент для автоматического fitView и центрирования на выбранном узле
const AutoFitView: React.FC<{
  currentFile: string | null
  nodes: Node[]
  selectedNodeId: string
}> = ({ currentFile, nodes, selectedNodeId }) => {
  const reactFlowInstance = useReactFlow()

  // fitView при изменении currentFile
  useEffect(() => {
    if (nodes.length > 0) {
      // Небольшая задержка для завершения рендера
      setTimeout(() => {
        reactFlowInstance.fitView({ duration: 800 })
      }, 200)
    }
  }, [currentFile, nodes.length, reactFlowInstance])

  // fitView при изменении размера контейнера (например, при ресайзе панели)
  useEffect(() => {
    const container = document.querySelector('.react-flow')
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      if (nodes.length > 0) {
        reactFlowInstance.fitView({ duration: 400 })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [nodes.length, reactFlowInstance])

  // Центрирование на выбранном узле
  useEffect(() => {
    if (selectedNodeId && nodes.length > 0) {
      const selectedNode = nodes.find(node => node.id === selectedNodeId)
      if (selectedNode) {
        reactFlowInstance.fitView({
          nodes: [selectedNode],
          duration: 800,
          padding: 0.5,
        })
      }
    }
  }, [selectedNodeId, nodes, reactFlowInstance])

  return null
}

export const Preview: React.FC<PreviewProps> = ({ currentFile }) => {
  // Состояние для combobox выбора узлов
  const [open, setOpen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')

  // Шаг 1: Получение контента текущего файла
  const { data: fileData, isLoading } = useQuery({
    queryKey: ['readFile', currentFile],
    queryFn: () => filesystemApi.readFile(currentFile!),
    enabled: !!currentFile,
  })

  // Шаги 2-5: Асинхронная обработка содержимого файла (резолвинг, парсинг, размеры, layout)
  const { nodes, edges, isProcessing, schemeContext } = useProcessSchema(fileData?.content, currentFile || '')

  // Создаем nodeTypes с замыканием на schemeContext
  const nodeTypes: NodeTypes = useMemo(() => ({
    entity: (props) => <EntityNode {...props} schemeContext={schemeContext} />,
  }), [schemeContext])

  // Локальное состояние для возможности перемещения узлов
  const [previewNodes, setNodes, onNodesChange] = useNodesState([])
  const [previewEdges, setEdges, onEdgesChange] = useEdgesState([])

  // Список имен узлов для combobox
  const nodeNames = useMemo(() => {
    return previewNodes.map(node => ({
      value: node.id,
      label: node.data.name || node.id,
    }))
  }, [previewNodes])

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

        {/* Combobox для выбора узлов - в правой части заголовка */}
        {nodeNames.length > 0 && (
          <div className="ml-auto">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="h-7 min-w-[180px] max-w-[400px] justify-between text-xs"
                >
                  <span className="truncate">
                    {selectedNodeId
                      ? nodeNames.find((node) => node.value === selectedNodeId)?.label
                      : "Выбрать узел..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="min-w-[180px] max-w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Поиск узла..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty>Узел не найден.</CommandEmpty>
                    <CommandGroup>
                      {nodeNames.map((node) => (
                        <CommandItem
                          key={node.value}
                          value={node.value}
                          onSelect={(currentValue) => {
                            setSelectedNodeId(currentValue === selectedNodeId ? '' : currentValue)
                            setOpen(false)
                          }}
                          className="text-xs"
                          title={node.label}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3 w-3 shrink-0",
                              selectedNodeId === node.value ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{node.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
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
            minZoom={0.01}
          >
            <Background />
            <Controls />
            <AutoFitView currentFile={currentFile} nodes={previewNodes} selectedNodeId={selectedNodeId} />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
