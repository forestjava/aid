import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {children}
    </div>
  )
}

