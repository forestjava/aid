import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { type Entity } from './types'
import { getEdgeColor } from './colors'

const EntityNode = ({ data }: NodeProps<Entity>) => {
  return (
    <div className="bg-background border-2 border-border rounded-lg shadow-lg min-w-[200px] w-fit">
      {/* Заголовок таблицы */}
      <div className="bg-primary text-primary-foreground px-3 py-2 rounded-t-md font-semibold text-sm">
        {data.name}
      </div>

      {/* Атрибуты */}
      <div className="divide-y divide-border">
        {data.attributes.map((attr, idx) => (
          <div
            key={idx}
            className="px-3 py-1.5 text-xs flex items-center justify-between gap-2 relative"
            style={
              attr.paletteIndex !== undefined
                ? { color: getEdgeColor(attr.paletteIndex) }
                : undefined
            }
          >
            {/* Handle для навигационных свойств */}
            {attr.hasConnection === 'target' && (
              <Handle
                type="target"
                position={Position.Left}
                id={`${data.name}-${attr.name}`}
                className="w-2 h-2 !-left-1"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              />
            )}
            {attr.hasConnection === 'source' && (
              <Handle
                type="source"
                position={Position.Right}
                id={`${data.name}-${attr.name}`}
                className="w-2 h-2 !-right-1"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              />
            )}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {attr.isPrimaryKey && (
                <span className="text-yellow-500" title="Primary Key">
                  🔑
                </span>
              )}
              {attr.isForeignKey && (
                <span className="text-blue-500" title="Foreign Key">
                  🔗
                </span>
              )}
              {attr.isNavigation && !attr.isCollection && (
                <span className="text-purple-500" title="Navigation Property">
                  →
                </span>
              )}
              {attr.isNavigation && attr.isCollection && (
                <span className="text-purple-500" title="Navigation Collection">
                  ⇉
                </span>
              )}
              <span className={`font-mono truncate ${attr.isPrimaryKey ? 'font-semibold' : ''} ${attr.isNavigation ? 'italic' : ''}`}>
                {attr.name}
                {attr.isRequired && (
                  <span className="text-red-500 ml-0.5" title="Required">
                    *
                  </span>
                )}
              </span>
            </div>
            <span className="text-muted-foreground text-[10px] whitespace-nowrap">
              {attr.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(EntityNode)

