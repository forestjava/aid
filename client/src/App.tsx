import { Layout } from '@/components/layout/Layout'
import { Header } from '@/components/layout/Header'
import { Main } from '@/components/layout/Main'
import { Footer } from '@/components/layout/Footer'
import { FileExplorer } from '@/components/workspace/FileExplorer'
import { Editor } from '@/components/workspace/Editor'
import { Preview } from '@/components/workspace/Preview'

const App = () => {
  return (
    <Layout>
      <Header>Система управления документацией</Header>
      <Main>
        <FileExplorer />
        <Editor />
        <Preview />
      </Main>
      <Footer>© 2025 ОЭЗ Алабуга</Footer>
    </Layout>
  )
}

export default App
