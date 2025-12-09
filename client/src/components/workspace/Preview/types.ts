// Типы для описания схемы БД

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
  hasConnection?: 'source' | 'target' // Роль навигационного свойства в связи
  paletteIndex?: number // Индекс в палитре цветов для связи
}

export interface EntityRelation {
  source: string // Имя сущности-источника связи (слева)
  sourceNavigation: string // Имя навигационного свойства источника
  target: string // Имя сущности-цели связи (справа)
  targetNavigation: string // Имя навигационного свойства цели
  paletteIndex: number // Индекс в палитре цветов
}

export interface Entity {
  name: string
  label: string
  attributes: EntityAttribute[]
}

export interface DatabaseSchema {
  entities: Entity[]
  relations: EntityRelation[]
}
