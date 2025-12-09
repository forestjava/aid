import type { Entity, EntityAttribute } from './types'

/**
 * Константы для расчета размеров узлов
 */
const METRICS = {
  // Высота
  HEADER_HEIGHT: 40, // высота заголовка с padding
  HEADER_LABEL_HEIGHT: 18, // дополнительная высота для label (text-xs + mt-0.5)
  ATTRIBUTE_ROW_HEIGHT: 30, // высота строки атрибута
  BORDER_WIDTH: 4, // border-2 = 2px с каждой стороны

  // Ширина
  MIN_WIDTH: 200,
  MAX_WIDTH: 500,
  PADDING_HORIZONTAL: 24, // px-3 = 12px с каждой стороны
  ICON_WIDTH: 20, // ширина иконки (🔑, 🔗, →, ⇉)
  GAP_WIDTH: 6, // gap между элементами
  CHAR_WIDTH_MONO: 7, // примерная ширина символа в моноширинном шрифте (font-mono)
  CHAR_WIDTH_REGULAR: 6, // примерная ширина символа в обычном шрифте
  TYPE_CHAR_WIDTH: 5, // ширина символа для типа (text-[10px])
}

/**
 * Вычисляет ширину текста на основе количества символов
 */
const estimateTextWidth = (text: string, isMonospace: boolean = false): number => {
  const charWidth = isMonospace ? METRICS.CHAR_WIDTH_MONO : METRICS.CHAR_WIDTH_REGULAR
  return text.length * charWidth
}

/**
 * Вычисляет ширину строки атрибута
 */
const calculateAttributeRowWidth = (attr: EntityAttribute): number => {
  let width = METRICS.PADDING_HORIZONTAL

  // Добавляем ширину иконки, если есть
  if (attr.isPrimaryKey || attr.isForeignKey || attr.isNavigation) {
    width += METRICS.ICON_WIDTH
    width += METRICS.GAP_WIDTH // gap после иконки
  }

  // Ширина имени атрибута (font-mono)
  width += estimateTextWidth(attr.name, true)

  // Gap между именем и типом
  width += METRICS.GAP_WIDTH * 2

  // Ширина типа (text-[10px])
  width += (attr.type || 'unknown').length * METRICS.TYPE_CHAR_WIDTH

  return width
}

/**
 * Вычисляет размеры одного узла (entity)
 */
export const calculateNodeDimensions = (entity: Entity): { width: number; height: number } => {
  // Высота = заголовок + (label если есть) + (количество атрибутов * высота строки) + границы
  const height =
    METRICS.HEADER_HEIGHT +
    (entity.label ? METRICS.HEADER_LABEL_HEIGHT : 0) +
    (entity.attributes.length * METRICS.ATTRIBUTE_ROW_HEIGHT) +
    METRICS.BORDER_WIDTH

  // Ширина = максимальная ширина среди:
  // 1. Ширина заголовка (имя entity и label, если есть)
  // 2. Ширина самой длинной строки атрибута
  const nameWidth = estimateTextWidth(entity.name, false)
  const labelWidth = entity.label ? estimateTextWidth(entity.label, false) : 0
  const headerWidth = Math.max(nameWidth, labelWidth) + METRICS.PADDING_HORIZONTAL

  const maxAttributeWidth = entity.attributes.reduce((max, attr) => {
    const attrWidth = calculateAttributeRowWidth(attr)
    return Math.max(max, attrWidth)
  }, 0)

  const calculatedWidth = Math.max(headerWidth, maxAttributeWidth)

  // Применяем ограничения по ширине
  const width = Math.max(
    METRICS.MIN_WIDTH,
    Math.min(METRICS.MAX_WIDTH, calculatedWidth)
  )

  return { width, height }
}

/**
 * Вычисляет размеры всех узлов в схеме
 * Возвращает Map с именем узла и его размерами
 */
export const calculateAllNodeDimensions = (
  entities: Entity[]
): Map<string, { width: number; height: number }> => {
  const dimensionsMap = new Map<string, { width: number; height: number }>()

  entities.forEach((entity) => {
    const dimensions = calculateNodeDimensions(entity)
    dimensionsMap.set(entity.name, dimensions)
  })

  return dimensionsMap
}
