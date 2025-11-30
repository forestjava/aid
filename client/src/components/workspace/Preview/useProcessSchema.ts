import { useState, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import dagre from 'dagre'
import type { DatabaseSchema, Entity } from './types'
import { resolveImports } from '@/components/workspace/Preview/dsl-import-resolver'
import { parseSchema } from '@/components/workspace/Preview/dsl-schema-parser'
import { calculateAllNodeDimensions } from './calculateNodeDimensions'
import { getEdgeColor } from './colors'

interface ProcessSchemaResult {
  nodes: Node[]
  edges: Edge[]
  isProcessing: boolean
}

const DEFAULT_NODE_WIDTH = 100
const DEFAULT_NODE_HEIGHT = 100

/**
 * Хук для асинхронной обработки содержимого DSL-файла
 * 
 * Процесс обработки:
 * Шаг 1. Получение контента текущего файла (происходит в компоненте через react-query)
 * Шаг 2. Резолвинг импортов, получение зависимостей, сбор кумулятивного текста
 * Шаг 3. Парсинг кумулятивного текста в объект схемы { entities, relations }
 * Шаг 4. Оценка размеров всех узлов на основе их содержимого
 * Шаг 5. Размещение узлов и связей на схеме dagre.layout
 * Шаг 6. Рендер компонента <ReactFlow /> (происходит в компоненте)
 */
export const useProcessSchema = (
  content: string | undefined,
  currentFilePath: string = ''
): ProcessSchemaResult => {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!content) {
      setNodes([])
      setEdges([])
      setIsProcessing(false)
      return
    }

    setIsProcessing(true)

    // Асинхронная обработка DSL
    const processContent = async () => {
      try {
        // Шаг 2: Резолвинг импортов, получение зависимостей, сбор кумулятивного текста
        console.log('Шаг 2: Резолвинг импортов...')
        const resolvedResult = await resolveImports(content, currentFilePath)

        if (resolvedResult.error) {
          console.error('Import resolution error:', resolvedResult.error)
        }

        // Шаг 3: Парсинг кумулятивного текста в объект схемы
        console.log('Шаг 3: Парсинг схемы...')
        const schema = await parseSchema(resolvedResult.content)

        if (!schema) {
          console.log('Schema parsing failed or empty result')
          setNodes([])
          setEdges([])
          return
        }

        // Шаг 4: Оценка размеров всех узлов на основе их содержимого
        console.log('Шаг 4: Оценка размеров узлов...')
        const nodeDimensions = calculateAllNodeDimensions(schema.entities)

        // Шаг 5: Размещение узлов и связей на схеме
        console.log('Шаг 5: Размещение узлов и связей (dagre.layout)...')
        const { nodes: layoutNodes, edges: layoutEdges } = layoutGraph(schema, nodeDimensions)

        setNodes(layoutNodes)
        setEdges(layoutEdges)
        console.log('Обработка завершена. Готово к рендеру (Шаг 6)')
      } catch (error) {
        console.error('DSL processing error:', error)
        setNodes([])
        setEdges([])
      } finally {
        setIsProcessing(false)
      }
    }

    processContent()
  }, [content, currentFilePath])

  return { nodes, edges, isProcessing }
}

/**
 * Выполняет размещение узлов и связей на схеме с использованием dagre
 * (Шаг 5 обработки)
 */
function layoutGraph(
  schema: DatabaseSchema,
  nodeDimensions: Map<string, { width: number; height: number }>
): { nodes: Node<Entity>[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: DEFAULT_NODE_WIDTH,
    marginx: 60,
    marginy: 40,
  })

  // Создаем узлы с рассчитанными размерами
  const nodes: Node<Entity>[] = schema.entities.map((entity) => {
    const dimensions = nodeDimensions.get(entity.name) || {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    }

    dagreGraph.setNode(entity.name, {
      width: dimensions.width,
      height: dimensions.height,
    })

    return {
      id: entity.name,
      type: 'entity',
      data: entity,
      position: { x: 0, y: 0 },
    }
  })

  // Создаем связи
  const edges: Edge[] = schema.relations.map((relation, index) => {
    dagreGraph.setEdge(relation.source, relation.target)

    return {
      id: `e${index}-${relation.source}-${relation.target}`,
      source: relation.source,
      target: relation.target,
      sourceHandle: `${relation.source}-${relation.sourceNavigation}`,
      targetHandle: `${relation.target}-${relation.targetNavigation}`,
      style: {
        strokeWidth: 2,
        stroke: getEdgeColor(index),
      },
    }
  })

  // Выполняем layout
  dagre.layout(dagreGraph)

  // Применяем позиции к узлам
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    const dimensions = nodeDimensions.get(node.data.name)

    if (nodeWithPosition && dimensions) {
      node.position = {
        x: nodeWithPosition.x - dimensions.width / 2,
        y: nodeWithPosition.y - dimensions.height / 2,
      }
    }
  })

  return { nodes, edges }
}

