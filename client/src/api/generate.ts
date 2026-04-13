import { toast } from 'sonner'

export interface GenerateRequest {
  projectName: string
  domain: string
  dslPath: string
}

export interface GenerateResponse {
  jobId: string
  repoUrl: string
  sseUrl: string
  status: string
}

export async function startGeneration(request: GenerateRequest): Promise<string | null> {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body}`)
    }

    const data: GenerateResponse = await res.json()
    toast.success('Генерация запущена', {
      description: `Project: ${request.projectName}`,
    })
    return data.jobId
  } catch (err) {
    toast.error('Ошибка запуска генерации', {
      description: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
