import type { ReactNode } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

interface MainProps {
  children: [ReactNode, ReactNode, ReactNode] // FileExplorer, Editor, Preview
}

export const Main = ({ children }: MainProps) => {
  const [fileExplorer, editor, preview] = children

  return (
    <main className="flex-1 overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* File Explorer Panel */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          {fileExplorer}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Editor Panel */}
        <ResizablePanel defaultSize={50} minSize={30}>
          {editor}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Preview Panel */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          {preview}
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  )
}

