import { useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Header } from '@/components/layout/Header'
import { Main } from '@/components/layout/Main'
import { Footer } from '@/components/layout/Footer'
import { FileExplorer } from '@/components/workspace/FileExplorer'
import { Editor } from '@/components/workspace/Editor'
import { Preview } from '@/components/workspace/Preview'

export const App = () => {
  const [currentFile, setCurrentFile] = useState<string | null>(null)

  const handleFileSelect = (path: string) => {
    setCurrentFile(path)
  }

  return (
    <Layout>
      <Header>Система управления документацией</Header>
      <Main>
        <FileExplorer onFileSelect={handleFileSelect} />
        <Editor currentFile={currentFile} />
        <Preview currentFile={currentFile} />
      </Main>
      <Footer>© 2025 ОЭЗ Алабуга</Footer>
    </Layout>
  )
}
