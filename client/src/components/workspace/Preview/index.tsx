import { useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'

import EntityNode from './EntityNode'
import { useERDLayout } from './useERDLayout'
import { testSchema } from './types'

interface PreviewProps {
  currentFile: string | null
}

const nodeTypes: NodeTypes = {
  entity: EntityNode,
}

export const Preview: React.FC<PreviewProps> = ({ currentFile }) => {
  // Пока используем тестовые данные
  const { nodes: layoutNodes, edges: layoutEdges } = useERDLayout(testSchema)

  const [nodes, , onNodesChange] = useNodesState(layoutNodes)
  const [edges, , onEdgesChange] = useEdgesState(layoutEdges)

  const onInit = useCallback(() => {
    console.log('ReactFlow initialized')
  }, [])

  return (
    <div className="h-full w-full bg-background border-l flex flex-col">
      <div className="h-10 border-b px-3 flex items-center text-sm font-medium shrink-0">
        Схема {currentFile && `- ${currentFile}`}
      </div>
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            style: { strokeWidth: 2 },
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
