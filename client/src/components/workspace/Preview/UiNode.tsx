import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { HEADER_HANDLE_ID, type Entity, type DatabaseSchema } from './types'
import { getAttributeStyle } from './styles'
import { getEntityHeaderColor } from './colors'

interface UiNodeProps extends NodeProps<Entity> {
  schema: DatabaseSchema
}

const UiNode: React.FC<UiNodeProps> = ({ data, schema }) => {
  return (
    <div className="bg-background border-2 border-border rounded-lg shadow-lg flex flex-row divide-x divide-border w-fit">
      {/* Заголовок — первая ячейка, текст повёрнут на 90° */}
      <div
        className="text-white px-2 py-3 rounded-l-md relative flex items-center justify-center"
        style={{ backgroundColor: getEntityHeaderColor(data.type) }}
      >
        {/* Header handles для связей без primary key */}
        {(data.hasHeaderConnection === 'target' || data.hasHeaderConnection === 'both') && (
          <Handle
            type="target"
            position={Position.Bottom}
            id={`${data.name}-${HEADER_HANDLE_ID}`}
            className="w-2 h-2 !-bottom-1"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
        {(data.hasHeaderConnection === 'source' || data.hasHeaderConnection === 'both') && (
          <Handle
            type="source"
            position={Position.Top}
            id={`${data.name}-${HEADER_HANDLE_ID}`}
            className="w-2 h-2 !-top-1"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <div className="font-semibold text-sm whitespace-nowrap">{data.name}</div>
          {data.label && (
            <div className="text-xs opacity-75 mt-0.5 whitespace-nowrap">{data.label}</div>
          )}
        </div>
      </div>

      {/* Атрибуты — горизонтальный ряд ячеек (label сверху, name снизу) */}
      {data.attributes.map((attr, idx) => {
        const style = getAttributeStyle(attr, schema)
        return (
          <div
            key={idx}
            className="py-1.5 text-xs flex flex-col items-stretch justify-start relative min-w-[50px]"
            style={style}
          >
            {(attr.hasConnection === 'target' || attr.hasConnection === 'both') && (
              <Handle
                type="target"
                position={Position.Bottom}
                id={`${data.name}-${attr.name}`}
                className="w-2 h-2 !-bottom-1"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              />
            )}
            {(attr.hasConnection === 'source' || attr.hasConnection === 'both') && (
              <Handle
                type="source"
                position={Position.Top}
                id={`${data.name}-${attr.name}`}
                className="w-2 h-2 !-top-1"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              />
            )}
            {/* Label — заголовок колонки */}
            {attr.label && (
              <span className="px-3 text-muted-foreground text-[10px] whitespace-nowrap mb-0.5 pb-1 border-b border-border text-center" title={attr.type}>
                {attr.label}
              </span>
            )}
            {/* Name — значение ячейки, центрировано в оставшемся пространстве */}
            <div className="px-3 flex-1 flex items-center justify-center gap-1 whitespace-nowrap">
              {attr.isPrimaryKey && (
                <span className="text-yellow-500" title="Primary Key">🔑</span>
              )}
              {attr.isForeignKey && (
                <span className="text-blue-500" title="Foreign Key">🔗</span>
              )}
              {attr.isNavigation && !attr.isCollection && (
                <span className="text-purple-500" title="Navigation Property">→</span>
              )}
              {attr.isNavigation && attr.isCollection && (
                <span className="text-purple-500" title="Navigation Collection">⇉</span>
              )}
              <span className={`font-mono ${attr.isPrimaryKey ? 'font-semibold' : ''} ${attr.isNavigation ? 'italic' : ''}`}>
                {attr.name}
                {attr.isRequired && (
                  <span className="text-red-500 ml-0.5" title="Required">*</span>
                )}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(UiNode)
