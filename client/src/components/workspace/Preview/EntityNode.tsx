import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { HEADER_HANDLE_ID, type Entity, type DatabaseSchema } from './types'
import { getAttributeStyle } from './styles'
import { getEntityHeaderColor } from './colors'

interface EntityNodeProps extends NodeProps<Entity> {
  schema: DatabaseSchema
}

const EntityNode: React.FC<EntityNodeProps> = ({ data, schema }) => {
  return (
    <div className="bg-background border-2 border-border rounded-lg shadow-lg min-w-[200px] w-fit">
      {/* Заголовок таблицы */}
      <div 
        className="text-white px-3 py-2 rounded-t-md relative"
        style={{ backgroundColor: getEntityHeaderColor(data.type) }}
      >
        {/* Header handles для связей без primary key */}
        {(data.hasHeaderConnection === 'target' || data.hasHeaderConnection === 'both') && (
          <Handle
            type="target"
            position={Position.Left}
            id={`${data.name}-${HEADER_HANDLE_ID}`}
            className="w-2 h-2 !-left-1"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          />
        )}
        {(data.hasHeaderConnection === 'source' || data.hasHeaderConnection === 'both') && (
          <Handle
            type="source"
            position={Position.Right}
            id={`${data.name}-${HEADER_HANDLE_ID}`}
            className="w-2 h-2 !-right-1"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          />
        )}
        <div className="font-semibold text-sm">{data.name}</div>
        {data.label && (
          <div className="text-xs opacity-75 mt-0.5">{data.label}</div>
        )}
      </div>

      {/* Атрибуты */}
      <div className="divide-y divide-border">
        {data.attributes.map((attr, idx) => {
          const style = getAttributeStyle(attr, schema)
          return (
            <div
              key={idx}
              className="px-3 py-1.5 text-xs flex items-center justify-between gap-2 relative"
              style={style}
            >
            {/* Handle для связей: target (слева), source (справа), both (оба) */}
            {(attr.hasConnection === 'target' || attr.hasConnection === 'both') && (
              <Handle
                type="target"
                position={Position.Left}
                id={`${data.name}-${attr.name}`}
                className="w-2 h-2 !-left-1"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              />
            )}
            {(attr.hasConnection === 'source' || attr.hasConnection === 'both') && (
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
            {attr.type && (
              <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                {attr.type}{attr.isCollection && '[]'}
              </span>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}

export default memo(EntityNode)

