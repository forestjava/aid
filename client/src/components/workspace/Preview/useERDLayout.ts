import { useMemo } from 'react'
import { type Node, type Edge } from 'reactflow'
import dagre from 'dagre'
import { type DatabaseSchema, type Entity } from './types'
import { type EntityNodeData } from './EntityNode'
import { getEdgeColor } from './colors'

const NODE_WIDTH = 200
const NODE_HEIGHT = 400

export const useERDLayout = (schema: DatabaseSchema | null) => {
  const { nodes, edges } = useMemo(() => {
    if (!schema) {
      return { nodes: [], edges: [] }
    }

    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({
      rankdir: 'LR',
      nodesep: NODE_HEIGHT,
      ranksep: NODE_WIDTH,
    })

    const nodes: Node<EntityNodeData>[] = schema.entities.map((entity) => {
      dagreGraph.setNode(entity.id, { width: NODE_WIDTH, height: NODE_HEIGHT })

      const entityWithConnections: Entity = {
        ...entity,
        attributes: entity.attributes.map((attr) => {
          const sourceRelation = schema.relations.find(
            (rel) => rel.source === entity.id && rel.sourceNavigation === attr.name
          )
          const targetRelation = schema.relations.find(
            (rel) => rel.target === entity.id && rel.targetNavigation === attr.name
          )

          if (sourceRelation) {
            return { ...attr, hasConnection: 'source' as const }
          } else if (targetRelation) {
            return { ...attr, hasConnection: 'target' as const }
          }
          return attr
        }),
      }

      return {
        id: entity.id,
        type: 'entity',
        data: entityWithConnections,
        position: { x: 0, y: 0 },
      }
    })

    const edges: Edge[] = schema.relations.map((relation, index) => {
      dagreGraph.setEdge(relation.source, relation.target)

      return {
        id: `e${index}-${relation.source}-${relation.target}`,
        source: relation.source,
        target: relation.target,
        sourceHandle: `${relation.source}-${relation.sourceNavigation}`,
        targetHandle: `${relation.target}-${relation.targetNavigation}`,
        //type: 'bezier',
        style: {
          strokeWidth: 2,
          stroke: getEdgeColor(index),
        },
      }
    })

    dagre.layout(dagreGraph)

    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id)
      if (nodeWithPosition) {
        node.position = {
          x: nodeWithPosition.x - NODE_WIDTH / 2,
          y: nodeWithPosition.y - NODE_HEIGHT / 2,
        }
      }
    })

    return { nodes, edges }
  }, [schema])

  return { nodes, edges }
}

