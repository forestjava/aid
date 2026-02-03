// Типы для описания схемы БД

// Цель sync-связи с опциональным условием и именем клона
export interface SyncTarget {
  target: string           // "EntityName.attributeName" или "EntityName(clone).attributeName"
  condition?: string       // "operation:SHIPPING" — информационное
  clone?: string           // "shipping" — имя клона для группировки
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
  paletteIndex?: number // Индекс в палитре цветов для связи
  sync?: SyncTarget[] // Массив sync-связей атрибута (для external связей)
}

export interface EntityRelation {
  source: string // Имя сущности-источника связи (слева)
  sourceNavigation: string // Имя навигационного свойства источника
  target: string // Имя сущности-цели связи (справа)
  targetNavigation: string // Имя навигационного свойства цели
  paletteIndex: number // Индекс в палитре цветов
  type: 'internal' | 'external' // Тип связи
}

export interface Entity {
  name: string
  label: string
  rank?: number // Позиция в layout для dagre (опционально, указывается явно в DSL)

  attributes: EntityAttribute[]
}

export interface DatabaseSchema {
  entities: Entity[]
  relations: EntityRelation[]
  hasExternalRelations: boolean // Есть ли в схеме external связи
  separate?: number
  annotation?: string // Текст аннотации схемы
}
