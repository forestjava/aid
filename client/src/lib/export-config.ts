import type { LucideIcon } from 'lucide-react'
import {
  Image,
  FileText,
  Braces,
  Database,
  Layout,
  Code2,
  Coffee,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DatabaseSchema } from '@/components/workspace/Preview/types'

/**
 * Тип элемента меню экспорта
 * Поддерживает иерархическую структуру через children
 */
export interface ExportMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  action?: (schema: DatabaseSchema) => void | Promise<void>
  children?: ExportMenuItem[]
  disabled?: boolean
}

/**
 * Контекст экспорта - передается в action-функции
 */
export interface ExportContext {
  schema: DatabaseSchema
  filename?: string
}

// ============================================
// Заглушки action-функций для экспорта
// Реальная реализация будет добавлена позже
// ============================================

const notImplemented = (format: string) => (schema: DatabaseSchema) => {
  console.log(`Export to ${format}:`, schema)
  toast.info(`Экспорт в ${format}`, {
    description: 'Ваш запрос принят и поставлен в очередь выполнения',
  })
}

// ============================================
// Конфигурация меню экспорта
// ============================================

export const exportMenuConfig: ExportMenuItem[] = [
  {
    id: 'image',
    label: 'Изображение',
    icon: Image,
    children: [
      {
        id: 'png',
        label: 'PNG',
        action: notImplemented('PNG'),
      },
      {
        id: 'svg',
        label: 'SVG',
        action: notImplemented('SVG'),
      },
    ],
  },
  {
    id: 'docs',
    label: 'Документация',
    icon: FileText,
    children: [
      {
        id: 'markdown',
        label: 'Markdown',
        action: notImplemented('Markdown'),
      },
      {
        id: 'confluence',
        label: 'Confluence',
        action: notImplemented('Confluence'),
      },
      {
        id: 'contracts',
        label: 'Контракты',
        action: notImplemented('Contracts'),
      },
      {
        id: 'tables',
        label: 'Описание таблиц и колонок',
        action: notImplemented('Tables description'),
      },
      {
        id: 'excel-format',
        label: 'Формат Excel для загрузки',
        action: notImplemented('Excel format'),
      },
    ],
  },
  {
    id: 'json',
    label: 'JSON',
    icon: Braces,
    children: [
      {
        id: 'json-random',
        label: 'Пакет со случайными значениями',
        action: notImplemented('JSON with random values'),
      },
    ],
  },
  {
    id: 'orm',
    label: 'ORM',
    icon: Database,
    children: [
      {
        id: 'prisma',
        label: 'Prisma',
        action: notImplemented('Prisma'),
      },
      {
        id: 'hasura',
        label: 'Hasura',
        action: notImplemented('Hasura'),
      },
      {
        id: 'strapi',
        label: 'Strapi',
        action: notImplemented('Strapi'),
      },
    ],
  },
  {
    id: 'crud',
    label: 'CRUD приложение',
    icon: Layout,
    children: [
      {
        id: 'backend-api',
        label: 'Backend API Server',
        action: notImplemented('Backend API'),
      },
      {
        id: 'frontend-admin',
        label: 'Frontend Admin App',
        action: notImplemented('Frontend Admin'),
      },
    ],
  },
  {
    id: 'sql',
    label: 'SQL',
    icon: Code2,
    children: [
      {
        id: 'hibernate-changelog',
        label: 'Hibernate changelog',
        action: notImplemented('Hibernate changelog'),
      },
      {
        id: 'hibernate-changes',
        label: 'Hibernate changes',
        action: notImplemented('Hibernate changes'),
      },
    ],
  },
  {
    id: 'java-spring',
    label: 'Java Spring',
    icon: Coffee,
    children: [
      {
        id: 'java-data',
        label: '@Data',
        action: notImplemented('Java @Data'),
      },
      {
        id: 'java-entity',
        label: '@Entity',
        action: notImplemented('Java @Entity'),
      },
      {
        id: 'java-repository',
        label: '@Repository',
        action: notImplemented('Java @Repository'),
      },
      {
        id: 'java-service',
        label: '@Service',
        action: notImplemented('Java @Service'),
      },
      {
        id: 'java-controller',
        label: '@RestController',
        action: notImplemented('Java @RestController'),
      },
    ],
  },
]
