// Типы для описания схемы БД

/** Специальный идентификатор для связи к заголовку сущности (когда нет primary key) */
export const HEADER_HANDLE_ID = '_header';

// Тип связи: internal (внутренняя) или external (внешняя)
export type RelationType = 'internal' | 'external'

// Тип сущности: одно из ключевых слов, определяющих сущность (нормализованное к английскому)
export type EntityType = 'entity' | 'class' | 'table' | 'model' | 'json' | 'dto' | 'endpoint' | 'enum' | 'store' | 'ui'

// Цель sync-связи с опциональным условием и именем клона
export interface SyncTarget {
  target: string           // "EntityName.attributeName" или "EntityName(clone).attributeName"
  condition?: string       // "operation:SHIPPING" — информационное
  clone?: string           // "shipping" — имя клона для группировки
  type: RelationType       // 'external' для sync/обмен, 'internal' для map/связь/relates/относится
}

export interface EntityAttribute {
  name: string
  label: string
  type?: string // Для скалярных типов: 'INTEGER', 'VARCHAR', etc. Для навигационных: 'EntityName' или 'EntityName[]'
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  isRequired?: boolean
  isNullable?: boolean
  // свойства, определяемые по значению type
  isNavigation?: boolean // Навигационное свойство (ссылка на другую сущность)
  isCollection?: boolean // Коллекция (массив) сущностей
  hasConnection?: 'source' | 'target' | 'both' // Роль в связи: source (справа), target (слева), both (для external связей)
  hasConnectionType?: RelationType // Тип связи, в которой участвует атрибут
  paletteIndex?: number // Индекс в палитре цветов для связи
  typeClones?: Array<{ type: string; isCollection: boolean; clone: string }>
  sync?: SyncTarget[] // Массив sync-связей атрибута (для external связей)
}

export interface EntityRelation {
  source: string // Имя сущности-источника связи (слева)
  sourceNavigation: string // Имя навигационного свойства источника
  target: string // Имя сущности-цели связи (справа)
  targetNavigation: string // Имя навигационного свойства цели
  paletteIndex: number // Индекс в палитре цветов
  type: RelationType // Тип связи
}

export interface Entity {
  name: string
  label: string
  type: EntityType // Ключевое слово, определившее сущность (нормализованное к английскому)
  rank?: number // Позиция в layout для dagre (опционально, указывается явно в DSL)
  offset?: number // Вертикальное смещение узла в пикселях (опционально, указывается явно в DSL)
  limit?: number // Максимальное число отображаемых атрибутов (опционально, указывается явно в DSL)
  hasHeaderConnection?: 'source' | 'target' | 'both' // Роль заголовка в связи (для сущностей без primary key)

  attributes: EntityAttribute[]
}

export interface DatabaseSchema {
  entities: Entity[]
  relations: EntityRelation[]
  hasExternalRelations: boolean // Есть ли в схеме external связи
  separate?: number
  annotation?: string // Текст аннотации схемы
  filter?: string // Фильтр схемы (only/filter)
}
