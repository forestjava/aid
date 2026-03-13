import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { HEADER_HANDLE_ID, type Entity, type EntityAttribute, type DatabaseSchema } from './types'
import { getAttributeStyle } from './styles'
import { getEntityHeaderColor } from './colors'

interface UiNodeProps extends NodeProps<Entity> {
  schema: DatabaseSchema
}

/**
 * Горизонтальная ячейка атрибута для ui-узла.
 * handlePrefix — для embedded-атрибутов содержит "parentAttr." для составного Handle ID.
 */
const UiCell: React.FC<{
  entityName: string
  attr: EntityAttribute
  handlePrefix: string
  schema: DatabaseSchema
}> = ({ entityName, attr, handlePrefix, schema }) => {
  const style = getAttributeStyle(attr, schema)
  const handleId = `${entityName}-${handlePrefix}${attr.name}`

  return (
    <div
      className="py-1.5 text-xs flex flex-col items-stretch justify-start relative min-w-[50px]"
      style={style}
    >
      {(attr.hasConnection === 'target' || attr.hasConnection === 'both') && (
        <Handle
          type="target"
          position={Position.Bottom}
          id={handleId}
          className="w-2 h-2 !-bottom-1"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        />
      )}
      {(attr.hasConnection === 'source' || attr.hasConnection === 'both') && (
        <Handle
          type="source"
          position={Position.Top}
          id={handleId}
          className="w-2 h-2 !-top-1"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        />
      )}
      {attr.label && (
        <span className="px-3 text-muted-foreground text-[10px] whitespace-nowrap mb-0.5 pb-1 border-b border-border text-center" title={attr.type}>
          {attr.label}
        </span>
      )}
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
      {attr.embeddedEntity && (
        <EmbeddedUiBlock
          entityName={entityName}
          attr={attr}
          handlePrefix={handlePrefix}
          schema={schema}
          depth={0}
        />
      )}
    </div>
  )
}

const EmbeddedUiBlock: React.FC<{
  entityName: string
  attr: EntityAttribute
  handlePrefix: string
  schema: DatabaseSchema
  depth: number
}> = ({ entityName, attr, handlePrefix, schema, depth }) => {
  const emb = attr.embeddedEntity!
  const embPrefix = `${handlePrefix}${attr.name}.`

  const nestedEmbedded = emb.attributes.filter(a => a.embeddedEntity)

  return (
    <div className="flex flex-col" style={{ opacity: Math.max(0.4, 1 - depth * 0.1) }}>
      <div className="mt-1 border border-border/50 rounded flex flex-row divide-x divide-border/50 w-fit">
        <div
          className="text-white px-1 py-2 rounded-l flex items-center justify-center"
          style={{ backgroundColor: getEntityHeaderColor(emb.type), opacity: 0.6 }}
        >
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            <div className="text-[10px] font-medium whitespace-nowrap">{emb.name}</div>
            {emb.label && (
              <div className="text-[9px] opacity-75 mt-0.5 whitespace-nowrap">{emb.label}</div>
            )}
          </div>
        </div>
        {emb.attributes.map((embAttr, idx) => (
          <UiCell
            key={idx}
            entityName={entityName}
            attr={embAttr}
            handlePrefix={embPrefix}
            schema={schema}
          />
        ))}
      </div>
      {nestedEmbedded.map((nestedAttr, idx) => (
        <EmbeddedUiBlock
          key={idx}
          entityName={entityName}
          attr={nestedAttr}
          handlePrefix={embPrefix}
          schema={schema}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

const UiNode: React.FC<UiNodeProps> = ({ data, schema }) => {
  const visibleAttrs = data.limit != null ? data.attributes.slice(0, data.limit) : data.attributes
  const hasEllipsis = data.limit != null && data.attributes.length > data.limit

  return (
    <div className="bg-background border-2 border-border rounded-lg shadow-lg flex flex-row divide-x divide-border w-fit">
      <div
        className="text-white px-2 py-3 rounded-l-md relative flex items-center justify-center"
        style={{ backgroundColor: getEntityHeaderColor(data.type) }}
      >
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

      {visibleAttrs.map((attr, idx) => (
        <UiCell
          key={idx}
          entityName={data.name}
          attr={attr}
          handlePrefix=""
          schema={schema}
        />
      ))}
      {hasEllipsis && (
        <div className="py-1.5 text-xs flex items-center justify-center text-muted-foreground min-w-[50px]">
          ...+{data.attributes.length - data.limit!}
        </div>
      )}
    </div>
  )
}

export default memo(UiNode)
