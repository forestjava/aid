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
import { exportToPng, exportToSvg } from './export-image'

export interface ExportMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  action?: (path: string) => void | Promise<string | null>
  children?: ExportMenuItem[]
  disabled?: boolean
}

const notImplemented = (format: string) => (_path: string) => {
  toast.info(`Экспорт в ${format}`, {
    description: 'Функция в разработке',
  })
}

async function startExporterJob(exporterId: string, path: string): Promise<string | null> {
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exporterId, path }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    toast.success('Экспорт запущен', { description: `Job: ${data.jobId}` })
    return data.jobId as string
  } catch (err) {
    toast.error('Ошибка запуска экспорта', {
      description: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export const exportMenuConfig: ExportMenuItem[] = [
  {
    id: 'image',
    label: 'Изображение',
    icon: Image,
    children: [
      {
        id: 'png',
        label: 'PNG',
        action: () => exportToPng(),
      },
      {
        id: 'svg',
        label: 'SVG',
        action: () => exportToSvg(),
      },
    ],
  },
  {
    id: 'docs',
    label: 'Документация',
    icon: FileText,
    children: [
      {
        id: 'demo',
        label: 'Demo Exporter',
        action: (path) => startExporterJob('demo', path),
      },
      {
        id: 'contract',
        label: 'Контракт OpenAPI',
        action: (path) => startExporterJob('contract', path),
      },      
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
        id: 'crud-api',
        label: 'AID описание CRUD API',
        action: (path) => startExporterJob('crud-api', path),
      },
      {
        id: 'toir-fullstack',
        label: 'TOiR Fullstack (Nest + React Admin)',
        action: (path) => startExporterJob('toir-fullstack', path),
      },
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
