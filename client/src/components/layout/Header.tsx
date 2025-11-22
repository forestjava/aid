import { ReactNode } from 'react'

interface HeaderProps {
  children: ReactNode
}

export const Header = ({ children }: HeaderProps) => {
  return (
    <header className="h-14 border-b bg-background px-4 flex items-center justify-between shrink-0">
      <h1 className="text-lg font-semibold">{children}</h1>
    </header>
  )
}

