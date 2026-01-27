import { useLocation, useNavigate } from 'react-router'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OnlyProps {
  children: React.ReactNode
}

export const Only: React.FC<OnlyProps> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()

  const handleExitPreview = () => {
    navigate(location.pathname)
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Верхняя полоса навигации */}
      <div className="h-10 border-b bg-muted/50 px-4 flex items-center justify-between shrink-0">
        <span className="text-sm text-muted-foreground">
          Режим просмотра схемы
        </span>
        <Button
          variant="link"
          size="sm"
          onClick={handleExitPreview}
          className="h-auto p-0 cursor-pointer"
        >
          <Maximize2 className="h-4 w-4" />
          Вернуться в полный режим управления документацией
        </Button>
      </div>
      {/* Контент занимает оставшееся пространство */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  )
}
