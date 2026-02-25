import { useState, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { DatabaseSchema, Entity } from './types'
import { parseSchema } from '@/components/workspace/Preview/dsl-schema-parser'
import { calculateAllNodeDimensions } from './calculateNodeDimensions'
import { getEdgeStyle } from './styles'

interface ProcessSchemaResult {
  nodes: Node[]
  edges: Edge[]
  isProcessing: boolean
  schema: DatabaseSchema | null
}

// Константы для настройки ELK-графа
const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 200
const ELK_SPACING_NODE = 40
const ELK_SPACING_BETWEEN_LAYERS = 200

// Создаем экземпляр ELK
const elk = new ELK()

/**
 * Хук для асинхронной обработки содержимого DSL-файла
 * 
 * Процесс обработки:
 * Шаг 1. Получение контента текущего файла с разрешёнными импортами (происходит в компоненте через react-query)
 * Шаг 2. Парсинг текста в объект схемы { entities, relations }
 * Шаг 3. Оценка размеров всех узлов на основе их содержимого
 * Шаг 4. Размещение узлов и связей на схеме ELK.layout
 * Шаг 5. Рендер компонента <ReactFlow /> (происходит в компоненте)
 */
export const useProcessSchema = (
  content: string | undefined
): ProcessSchemaResult => {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)

  useEffect(() => {
    if (!content) {
      setNodes([])
      setEdges([])
      setSchema(null)
      setIsProcessing(false)
      return
    }

    setIsProcessing(true)

    // Асинхронная обработка DSL
    const processContent = async () => {
      try {
        // Шаг 2: Парсинг текста в объект схемы
        const schema = await parseSchema(content)

        if (!schema) {
          setNodes([])
          setEdges([])
          setSchema(null)
          return
        }

        // Шаг 3: Оценка размеров всех узлов на основе их содержимого
        const nodeDimensions = calculateAllNodeDimensions(schema.entities)

        // Шаг 4: Размещение узлов и связей на схеме
        const { nodes: layoutNodes, edges: layoutEdges } = await layoutGraph(
          schema,
          nodeDimensions
        )

        setNodes(layoutNodes)
        setEdges(layoutEdges)
        setSchema(schema)
      } catch (error) {
        console.error('DSL processing error:', error)
        setNodes([])
        setEdges([])
        setSchema(null)
      } finally {
        setIsProcessing(false)
      }
    }

    processContent()
  }, [content])

  return { nodes, edges, isProcessing, schema }
}

/**
 * Выполняет размещение узлов и связей на схеме с использованием ELK
 * (Шаг 4 обработки)
 */
async function layoutGraph(
  schema: DatabaseSchema,
  nodeDimensions: Map<string, { width: number; height: number }>
): Promise<{ nodes: Node<Entity>[]; edges: Edge[] }> {
  
  // Используем значение separate из схемы, если указано
  const layerSpacing = schema.separate || ELK_SPACING_BETWEEN_LAYERS

  // Формируем граф для ELK
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(ELK_SPACING_NODE),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.partitioning.activate': 'true',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.allowNonFlowPortsToSwitchSides': 'true',
      'elk.portAlignment.north': 'DISTRIBUTED',
      'elk.portAlignment.south': 'DISTRIBUTED',
    },
    children: schema.entities.map((entity) => {
      const dimensions = nodeDimensions.get(entity.name) || {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      }
      const isUi = entity.type === 'ui'

      return {
        id: entity.name,
        width: dimensions.width,
        height: dimensions.height,
        // Для ui-узлов: порты на NORTH/SOUTH с фиксированной стороной
        ...(isUi && {
          properties: {
            'portConstraints': 'FIXED_SIDE',
          },
          ports: entity.attributes
            .filter(attr => attr.hasConnection)
            .map((attr) => ({
              id: `${entity.name}-${attr.name}`,
              properties: {
                'port.side': 'NORTH',
              },
            })),
        }),
        // Передаём rank как partition для ELK
        layoutOptions: {
            'elk.partitioning.partition': String(entity.rank),
        },
      }
    }),
    // Направление edges уже корректно определено в buildLinkRelations (source.rank <= target.rank)
    edges: schema.relations.map((relation, index) => ({
      id: `e${index}-${relation.source}-${relation.target}`,
      sources: [relation.source],
      targets: [relation.target],
      'elk.edge.type': 'association'
    })),
  }

  // Выполняем layout
  const layoutResult = await elk.layout(elkGraph)

  // Создаем React Flow nodes с позициями от ELK
  const nodes: Node<Entity>[] = schema.entities.map((entity) => {
    const elkNode = layoutResult.children?.find(n => n.id === entity.name)
    
    return {
      id: entity.name,
      type: entity.type === 'ui' ? 'ui' : 'entity',
      data: entity,
      position: {
        x: elkNode?.x ?? 0,
        y: (elkNode?.y ?? 0) + (entity.offset ?? 0),
      },
    }
  })

  // Создаем React Flow edges со стилями
  const edges: Edge[] = schema.relations.map((relation, index) => ({
    id: `e${index}-${relation.source}-${relation.target}`,
    source: relation.source,
    target: relation.target,
    sourceHandle: `${relation.source}-${relation.sourceNavigation}`,
    targetHandle: `${relation.target}-${relation.targetNavigation}`,
    ...getEdgeStyle(relation, schema),
  }))

  return { nodes, edges }
}
