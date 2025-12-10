import { useState, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import dagre from 'dagre'
import type { DatabaseSchema, Entity, SchemeContext } from './types'
import { resolveImports } from '@/components/workspace/Preview/dsl-import-resolver'
import { parseSchema } from '@/components/workspace/Preview/dsl-schema-parser'
import { calculateAllNodeDimensions } from './calculateNodeDimensions'
import { getEdgeStyle } from './styles'

interface ProcessSchemaResult {
  nodes: Node[]
  edges: Edge[]
  isProcessing: boolean
  schemeContext: SchemeContext
}

// Константы для настройки dagre-графа
const DEFAULT_NODE_WIDTH = 100
const DEFAULT_NODE_HEIGHT = 100
const GRAPH_RANKDIR = 'LR'
const GRAPH_NODESEP = 40
const GRAPH_MARGINX = 60
const GRAPH_MARGINY = 40
const RELATIONS_PER_RANKSEP_UNIT = 5 // Количество связей на одну единицу ranksep

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
  const [schemeContext, setSchemeContext] = useState<SchemeContext>({ hasExternalRelations: false })

  useEffect(() => {
    if (!content) {
      setNodes([])
      setEdges([])
      setSchemeContext({ hasExternalRelations: false })
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
        const hasExternalRelations = schema.relations.some(r => r.type === 'external')
        const context: SchemeContext = { hasExternalRelations }
        const { nodes: layoutNodes, edges: layoutEdges } = layoutGraph(
          schema,
          nodeDimensions,
          context
        )

        setNodes(layoutNodes)
        setEdges(layoutEdges)
        setSchemeContext(context)
        console.log('Обработка завершена. Готово к рендеру (Шаг 6)')
      } catch (error) {
        console.error('DSL processing error:', error)
        setNodes([])
        setEdges([])
        setSchemeContext({ hasExternalRelations: false })
      } finally {
        setIsProcessing(false)
      }
    }

    processContent()
  }, [content, currentFilePath])

  return { nodes, edges, isProcessing, schemeContext }
}

/**
 * Выполняет размещение узлов и связей на схеме с использованием dagre
 * (Шаг 5 обработки)
 */
function layoutGraph(
  schema: DatabaseSchema,
  nodeDimensions: Map<string, { width: number; height: number }>,
  schemeContext: SchemeContext
): { nodes: Node<Entity>[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // Динамический расчет ranksep в зависимости от количества связей
  // На каждые RELATIONS_PER_RANKSEP_UNIT связей - одна ширина узла
  const relationsCount = schema.relations.length
  const ranksep = Math.max(1, Math.ceil(relationsCount / RELATIONS_PER_RANKSEP_UNIT)) * DEFAULT_NODE_WIDTH
  
  dagreGraph.setGraph({
    rankdir: GRAPH_RANKDIR,
    nodesep: GRAPH_NODESEP,
    ranksep,
    marginx: GRAPH_MARGINX,
    marginy: GRAPH_MARGINY,
  })

  // Создаем узлы с рассчитанными размерами
  const nodes: Node[] = schema.entities.map((entity) => {
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
      ...getEdgeStyle(relation, schemeContext),
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

