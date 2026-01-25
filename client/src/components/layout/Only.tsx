interface OnlyProps {
  children: React.ReactNode
}

export const Only: React.FC<OnlyProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen">
      {children}
    </div>
  )
}
