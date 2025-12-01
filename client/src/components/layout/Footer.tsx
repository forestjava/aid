import { type ReactNode } from 'react'

interface FooterProps {
  children: ReactNode
}

export const Footer = ({ children }: FooterProps) => {
  return (
    <footer className="h-8 border-t bg-background px-4 flex items-center text-xs text-muted-foreground shrink-0">
      {children}
    </footer>
  )
}

