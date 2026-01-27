import { toPng, toSvg } from 'html-to-image'
import { saveAs } from 'file-saver'
import { toast } from 'sonner'

/**
 * Получение ReactFlow контейнера через DOM selector
 * Этот подход уже используется в AutoFitView компоненте
 */
const getReactFlowElement = (): HTMLElement | null => {
  return document.querySelector('.react-flow') as HTMLElement | null
}

/**
 * Фильтр для исключения UI-элементов ReactFlow из экспорта
 * Исключает: controls, background, minimap, panels
 * Важно: проверяем Element, а не HTMLElement, т.к. Background - это SVG элемент
 */
const exportFilter = (node: Node): boolean => {
  if (node instanceof Element) {
    const classList = node.classList
    if (
      classList.contains('react-flow__controls') ||
      classList.contains('react-flow__background') ||
      classList.contains('react-flow__minimap') ||
      classList.contains('react-flow__panel')
    ) {
      return false
    }
  }
  return true
}

/**
 * Экспорт схемы в PNG формат
 * Использует pixelRatio: 2 для хорошего качества изображения
 */
export const exportToPng = async (): Promise<void> => {
  const element = getReactFlowElement()
  if (!element) {
    toast.error('Ошибка экспорта', {
      description: 'Не удалось найти схему для экспорта',
    })
    return
  }

  try {
    toast.info('Экспорт в PNG', {
      description: 'Подготовка изображения...',
    })

    const dataUrl = await toPng(element, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: exportFilter,
    })

    saveAs(dataUrl, 'schema.png')

    toast.success('Экспорт завершен', {
      description: 'Схема сохранена в schema.png',
    })
  } catch (error) {
    console.error('PNG export failed:', error)
    toast.error('Ошибка экспорта в PNG', {
      description: error instanceof Error ? error.message : 'Неизвестная ошибка',
    })
  }
}

/**
 * Экспорт схемы в SVG формат
 * SVG - векторный формат, подходит для редактирования в графических редакторах
 */
export const exportToSvg = async (): Promise<void> => {
  const element = getReactFlowElement()
  if (!element) {
    toast.error('Ошибка экспорта', {
      description: 'Не удалось найти схему для экспорта',
    })
    return
  }

  try {
    toast.info('Экспорт в SVG', {
      description: 'Подготовка изображения...',
    })

    const dataUrl = await toSvg(element, {
      backgroundColor: '#ffffff',
      filter: exportFilter,
    })

    // Декодируем Data URL и создаем Blob
    const svgString = decodeURIComponent(dataUrl.split(',')[1])
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })

    saveAs(blob, 'schema.svg')

    toast.success('Экспорт завершен', {
      description: 'Схема сохранена в schema.svg',
    })
  } catch (error) {
    console.error('SVG export failed:', error)
    toast.error('Ошибка экспорта в SVG', {
      description: error instanceof Error ? error.message : 'Неизвестная ошибка',
    })
  }
}
