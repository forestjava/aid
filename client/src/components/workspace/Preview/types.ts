// Типы для описания схемы БД

export interface EntityAttribute {
  name: string
  type: string // Для скалярных типов: 'INTEGER', 'VARCHAR', etc. Для навигационных: 'EntityName' или 'EntityName[]'
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  isNullable?: boolean
  isNavigation?: boolean // Навигационное свойство (ссылка на другую сущность)
  isCollection?: boolean // Коллекция (массив) сущностей
  hasConnection?: 'source' | 'target' // Роль навигационного свойства в связи
}

export interface EntityRelation {
  source: string // Имя сущности-источника связи (слева)
  sourceNavigation: string // Имя навигационного свойства источника
  target: string // Имя сущности-цели связи (справа)
  targetNavigation: string // Имя навигационного свойства цели
}

export interface Entity {
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
      name: 'Post',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'user_id', type: 'INTEGER', isForeignKey: true },
        { name: 'title', type: 'VARCHAR(200)' },
        { name: 'content', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
        // Навигационные свойства
        { name: 'author', type: 'User', isNavigation: true },
        { name: 'comments', type: 'Comment[]', isNavigation: true, isCollection: true },
        { name: 'categories', type: 'Category[]', isNavigation: true, isCollection: true },
      ],
    },
    {
      name: 'User',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'email', type: 'VARCHAR(255)' },
        { name: 'username', type: 'VARCHAR(100)' },
        // Навигационные свойства
        { name: 'posts', type: 'Post[]', isNavigation: true, isCollection: true },
        { name: 'comments', type: 'Comment[]', isNavigation: true, isCollection: true },
      ],
    },
    {
      name: 'Comment',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'post_id', type: 'INTEGER', isForeignKey: true },
        { name: 'user_id', type: 'INTEGER', isForeignKey: true },
        { name: 'content', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
        // Навигационные свойства
        { name: 'post', type: 'Post', isNavigation: true },
        { name: 'author', type: 'User', isNavigation: true },
      ],
    },
    {
      name: 'Category',
      attributes: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'VARCHAR(100)' },
        { name: 'description', type: 'TEXT', isNullable: true },
        // Навигационные свойства
        { name: 'posts', type: 'Post[]', isNavigation: true, isCollection: true },
      ],
    },
  ],
  relations: [
    {
      // Post -> Comment (Post.comments -> Comment.post)
      source: 'Post',
      sourceNavigation: 'comments',
      target: 'Comment',
      targetNavigation: 'post',
    },
    {
      // Post -> Category (Post.categories -> Category.posts)
      source: 'Post',
      sourceNavigation: 'categories',
      target: 'Category',
      targetNavigation: 'posts',
    },
    {
      // User -> Post (User.posts -> Post.author)
      source: 'User',
      sourceNavigation: 'posts',
      target: 'Post',
      targetNavigation: 'author',
    },
    {
      // User -> Comment (User.comments -> Comment.author)
      source: 'User',
      sourceNavigation: 'comments',
      target: 'Comment',
      targetNavigation: 'author',
    },
  ],
}

