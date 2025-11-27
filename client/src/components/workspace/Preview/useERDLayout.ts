import { useMemo } from 'react'
import { type Node, type Edge } from 'reactflow'
import dagre from 'dagre'
import { type DatabaseSchema, type Entity } from './types'
import { type EntityNodeData } from './EntityNode'
import { getEdgeColor } from './colors'

const NODE_WIDTH = 250
const NODE_HEIGHT = 150

// Функция для расчета высоты узла на основе количества атрибутов
const calculateNodeHeight = (entity: Entity): number => {
  const headerHeight = 40
  const attributeHeight = 28
  const totalHeight = headerHeight + entity.attributes.length * attributeHeight
  return Math.max(totalHeight, NODE_HEIGHT)
}

export const useERDLayout = (schema: DatabaseSchema | null) => {
  const { nodes, edges } = useMemo(() => {
    if (!schema) {
      return { nodes: [], edges: [] }
    }

    // Создаем граф для dagre
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({
      rankdir: 'TB', // Top to Bottom
      nodesep: 100,
      ranksep: 150,
      marginx: 50,
      marginy: 50,
    })

    // Создаем узлы для каждой сущности
    const nodes: Node<EntityNodeData>[] = schema.entities.map((entity) => {
      const height = calculateNodeHeight(entity)

      // Добавляем узел в граф dagre
      dagreGraph.setNode(entity.id, { width: NODE_WIDTH, height })

      return {
        id: entity.id,
        type: 'entity',
        data: entity,
        position: { x: 0, y: 0 }, // Будет обновлено после расчета layout
      }
    })

    // Создаем ребра для связей
    const edges: Edge[] = schema.relations.map((relation, index) => {
      // Добавляем ребро в граф dagre для расчета layout
      dagreGraph.setEdge(relation.source, relation.target)

      const edgeColor = getEdgeColor(index)

      return {
        id: `e${index}-${relation.source}-${relation.target}`,
        source: relation.source,
        target: relation.target,
        sourceHandle: `${relation.source}-${relation.sourceNavigation}`,
        targetHandle: `${relation.target}-${relation.targetNavigation}`,
        type: 'smoothstep',
        style: {
          strokeWidth: 2,
          stroke: edgeColor,
        },
      }
    })

    // Запускаем алгоритм layout
    dagre.layout(dagreGraph)

    // Обновляем позиции узлов на основе расчета dagre
    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id)
      if (nodeWithPosition) {
        // Dagre возвращает центр узла, поэтому нужно скорректировать на левый верхний угол
        node.position = {
          x: nodeWithPosition.x - NODE_WIDTH / 2,
          y: nodeWithPosition.y - nodeWithPosition.height / 2,
        }
      }
    })

    return { nodes, edges }
  }, [schema])

  return { nodes, edges }
}

