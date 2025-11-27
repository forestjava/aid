// Типы для описания схемы БД

export interface EntityAttribute {
  name: string
  type: string
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  isNullable?: boolean
}

export interface EntityRelation {
  from: string // ID сущности источника
  to: string // ID сущности назначения
  type: 'one-to-one' | 'one-to-many' | 'many-to-many'
  fromField: string
  toField: string
}

export interface Entity {
  id: string
  name: string
  attributes: EntityAttribute[]
}

export interface DatabaseSchema {
  entities: Entity[]
  relations: EntityRelation[]
}

// Тестовые данные
export const testSchema: DatabaseSchema = {
  entities: [
    {
      id: 'users',
      name: 'Users',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'email', type: 'VARCHAR(255)' },
        { name: 'username', type: 'VARCHAR(100)' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ],
    },
    {
      id: 'posts',
      name: 'Posts',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'user_id', type: 'INTEGER', isForeignKey: true },
        { name: 'title', type: 'VARCHAR(200)' },
        { name: 'content', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ],
    },
    {
      id: 'comments',
      name: 'Comments',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'post_id', type: 'INTEGER', isForeignKey: true },
        { name: 'user_id', type: 'INTEGER', isForeignKey: true },
        { name: 'content', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ],
    },
    {
      id: 'categories',
      name: 'Categories',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'VARCHAR(100)' },
        { name: 'description', type: 'TEXT', isNullable: true },
      ],
    },
    {
      id: 'post_categories',
      name: 'PostCategories',
      attributes: [
        { name: 'post_id', type: 'INTEGER', isPrimaryKey: true, isForeignKey: true },
        { name: 'category_id', type: 'INTEGER', isPrimaryKey: true, isForeignKey: true },
      ],
    },
  ],
  relations: [
    {
      from: 'users',
      to: 'posts',
      type: 'one-to-many',
      fromField: 'id',
      toField: 'user_id',
    },
    {
      from: 'users',
      to: 'comments',
      type: 'one-to-many',
      fromField: 'id',
      toField: 'user_id',
    },
    {
      from: 'posts',
      to: 'comments',
      type: 'one-to-many',
      fromField: 'id',
      toField: 'post_id',
    },
    {
      from: 'posts',
      to: 'post_categories',
      type: 'one-to-many',
      fromField: 'id',
      toField: 'post_id',
    },
    {
      from: 'categories',
      to: 'post_categories',
      type: 'one-to-many',
      fromField: 'id',
      toField: 'category_id',
    },
  ],
}

