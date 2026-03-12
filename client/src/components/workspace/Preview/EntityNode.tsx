import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { HEADER_HANDLE_ID, type Entity, type EntityAttribute, type DatabaseSchema } from './types'
import { getAttributeStyle } from './styles'
import { getEntityHeaderColor } from './colors'

interface EntityNodeProps extends NodeProps<Entity> {
  schema: DatabaseSchema
}

/**
 * Строка атрибута с Handles и иконками.
 * handlePrefix — для embedded-атрибутов содержит "parentAttr." для составного Handle ID.
 */
const AttributeRow: React.FC<{
  entityName: string
  attr: EntityAttribute
  handlePrefix: string
  schema: DatabaseSchema
}> = ({ entityName, attr, handlePrefix, schema }) => {
  const style = getAttributeStyle(attr, schema)
  const handleId = `${entityName}-${handlePrefix}${attr.name}`

  return (
    <div
      className="px-3 py-1.5 text-xs flex items-center justify-between gap-2 relative"
      style={style}
    >
      {(attr.hasConnection === 'target' || attr.hasConnection === 'both') && (
        <Handle
          type="target"
          position={Position.Left}
          id={handleId}
          className="w-2 h-2 !-left-1"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
      {(attr.hasConnection === 'source' || attr.hasConnection === 'both') && (
        <Handle
          type="source"
          position={Position.Right}
          id={handleId}
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
  )
}

const EmbeddedEntityBlock: React.FC<{
  entityName: string
  attr: EntityAttribute
  handlePrefix: string
  schema: DatabaseSchema
  depth: number
}> = ({ entityName, attr, handlePrefix, schema, depth }) => {
  const emb = attr.embeddedEntity!
  const embPrefix = `${handlePrefix}${attr.name}.`

  return (
    <div className="ml-2 mr-2 mb-1 border border-border/50 rounded" style={{ opacity: Math.max(0.4, 1 - depth * 0.1) }}>
      <div
        className="px-2 py-1 text-[10px] font-medium rounded-t"
        style={{ backgroundColor: getEntityHeaderColor(emb.type), opacity: 0.6, color: 'white' }}
      >
        {emb.name}
        {emb.label && (
          <span className="ml-1 opacity-75">{emb.label}</span>
        )}
      </div>
      <div className="divide-y divide-border/50">
        {emb.attributes.map((embAttr, idx) => (
          <div key={idx}>
            <AttributeRow
              entityName={entityName}
              attr={embAttr}
              handlePrefix={embPrefix}
              schema={schema}
            />
            {embAttr.embeddedEntity && (
              <EmbeddedEntityBlock
                entityName={entityName}
                attr={embAttr}
                handlePrefix={embPrefix}
                schema={schema}
                depth={depth + 1}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const EntityNode: React.FC<EntityNodeProps> = ({ data, schema }) => {
  return (
    <div className="bg-background border-2 border-border rounded-lg shadow-lg min-w-[200px] w-fit">
      <div 
        className="text-white px-3 py-2 rounded-t-md relative"
        style={{ backgroundColor: getEntityHeaderColor(data.type) }}
      >
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

      <div className="divide-y divide-border">
        {(data.limit != null ? data.attributes.slice(0, data.limit) : data.attributes).map((attr, idx) => (
          <div key={idx}>
            <AttributeRow
              entityName={data.name}
              attr={attr}
              handlePrefix=""
              schema={schema}
            />
            {attr.embeddedEntity && (
              <EmbeddedEntityBlock
                entityName={data.name}
                attr={attr}
                handlePrefix=""
                schema={schema}
                depth={0}
              />
            )}
          </div>
        ))}
        {data.limit != null && data.attributes.length > data.limit && (
          <div className="px-3 py-1.5 text-xs text-center text-muted-foreground">
            ... +{data.attributes.length - data.limit} more
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(EntityNode)

