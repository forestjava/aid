import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { toast } from 'sonner'
import { App } from './App.tsx'
import { Toaster } from '@/components/ui/sonner'

import './index.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Ошибка получения данных с сервера', {
        description: message,
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Ошибка отправки данных на сервер', {
        description: message,
      })
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Создаём роутер с catch-all маршрутом
const router = createBrowserRouter([
  {
    path: '*', // Ловит все пути: /, /Demo, /Demo/users, /ALIS/orders и т.д.
    element: (
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top-right" />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    ),
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
