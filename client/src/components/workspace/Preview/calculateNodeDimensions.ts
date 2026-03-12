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

  // Embedded (зависимые сущности)
  EMBEDDED_HEADER_HEIGHT: 24, // заголовок embedded-блока
  EMBEDDED_PADDING: 8, // вертикальный padding embedded-блока (top + bottom)
  EMBEDDED_INDENT: 8, // горизонтальный отступ embedded-блока (ml-2)

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
  width += (attr.type?.length ?? 0) * METRICS.TYPE_CHAR_WIDTH

  return width
}

/**
 * Вычисляет высоту embedded-секции для одного атрибута
 */
const calculateEmbeddedHeight = (attr: EntityAttribute): number => {
  if (!attr.embeddedEntity) return 0
  const embAttrs = attr.embeddedEntity.attributes
  const nestedHeight = embAttrs.reduce((sum, a) => sum + calculateEmbeddedHeight(a), 0)
  return METRICS.EMBEDDED_HEADER_HEIGHT +
    embAttrs.length * METRICS.ATTRIBUTE_ROW_HEIGHT +
    nestedHeight +
    METRICS.EMBEDDED_PADDING
}

/**
 * Вычисляет максимальную ширину embedded-секции для одного атрибута (рекурсивно)
 */
const calculateEmbeddedWidth = (attr: EntityAttribute): number => {
  if (!attr.embeddedEntity) return 0
  const emb = attr.embeddedEntity
  const embHeaderWidth = estimateTextWidth(emb.name, false) + METRICS.PADDING_HORIZONTAL
  const embMaxAttrWidth = emb.attributes.reduce((max, embAttr) => {
    return Math.max(max, calculateAttributeRowWidth(embAttr), calculateEmbeddedWidth(embAttr))
  }, 0)
  return METRICS.EMBEDDED_INDENT + Math.max(embHeaderWidth, embMaxAttrWidth)
}

/**
 * Вычисляет размеры одного узла (entity)
 */
export const calculateNodeDimensions = (entity: Entity): { width: number; height: number } => {
  const displayedCount = entity.limit != null
    ? Math.min(entity.attributes.length, entity.limit)
    : entity.attributes.length
  const hasEllipsis = entity.limit != null && entity.attributes.length > entity.limit

  const visibleAttrs = entity.attributes.slice(0, displayedCount)

  // Высота embedded-секций видимых атрибутов
  const embeddedHeight = visibleAttrs.reduce((sum, attr) => sum + calculateEmbeddedHeight(attr), 0)

  // Высота = заголовок + (label если есть) + (количество видимых атрибутов * высота строки) + embedded-секции + (ellipsis строка) + границы
  const height =
    METRICS.HEADER_HEIGHT +
    (entity.label ? METRICS.HEADER_LABEL_HEIGHT : 0) +
    (displayedCount * METRICS.ATTRIBUTE_ROW_HEIGHT) +
    embeddedHeight +
    (hasEllipsis ? METRICS.ATTRIBUTE_ROW_HEIGHT : 0) +
    METRICS.BORDER_WIDTH

  // Ширина = максимальная ширина среди:
  // 1. Ширина заголовка (имя entity и label, если есть)
  // 2. Ширина самой длинной строки видимого атрибута (включая embedded-секции)
  const nameWidth = estimateTextWidth(entity.name, false)
  const labelWidth = entity.label ? estimateTextWidth(entity.label, false) : 0
  const headerWidth = Math.max(nameWidth, labelWidth) + METRICS.PADDING_HORIZONTAL

  const maxAttributeWidth = visibleAttrs.reduce((max, attr) => {
    const attrWidth = calculateAttributeRowWidth(attr)
    const embWidth = calculateEmbeddedWidth(attr)
    return Math.max(max, attrWidth, embWidth)
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
 * Константы для расчёта размеров ui-узлов (горизонтальная раскладка)
 */
const UI_METRICS = {
  HEADER_ROTATED_WIDTH: 32,    // ширина повёрнутого заголовка (line-height + px-2 padding)
  HEADER_PADDING_VERTICAL: 24, // py-3 = 12px с каждой стороны
  CELL_MIN_WIDTH: 50,          // минимальная ширина ячейки атрибута
  CELL_HEIGHT_BASE: 36,        // высота ячейки без label (name + padding)
  CELL_HEIGHT_WITH_LABEL: 50,  // высота ячейки с label (label + name + padding)
  BORDER_WIDTH: 4,             // border-2 = 2px с каждой стороны
}

/**
 * Вычисляет ширину одной ячейки атрибута для горизонтального ui-узла
 * Учитывает label (заголовок колонки) и name (значение)
 */
const calculateUiCellWidth = (attr: EntityAttribute): number => {
  let nameWidth = METRICS.PADDING_HORIZONTAL

  if (attr.isPrimaryKey || attr.isForeignKey || attr.isNavigation) {
    nameWidth += METRICS.ICON_WIDTH
    nameWidth += METRICS.GAP_WIDTH
  }

  nameWidth += estimateTextWidth(attr.name, true)

  // Ширина label (text-[10px], обычный шрифт)
  const labelWidth = attr.label
    ? METRICS.PADDING_HORIZONTAL + attr.label.length * METRICS.TYPE_CHAR_WIDTH
    : 0

  return Math.max(UI_METRICS.CELL_MIN_WIDTH, nameWidth, labelWidth)
}

/**
 * Вычисляет размеры одного ui-узла (горизонтальная раскладка, как шапка таблицы)
 * Заголовок повёрнут на 90° (writing-mode: vertical-rl)
 */
export const calculateUiNodeDimensions = (entity: Entity): { width: number; height: number } => {
  const displayedCount = entity.limit != null
    ? Math.min(entity.attributes.length, entity.limit)
    : entity.attributes.length
  const hasEllipsis = entity.limit != null && entity.attributes.length > entity.limit

  // Ширина заголовка — фиксированная (определяется line-height повёрнутого текста)
  const headerWidth = UI_METRICS.HEADER_ROTATED_WIDTH

  // Высота заголовка — определяется длиной текста (повёрнутого)
  const nameTextHeight = estimateTextWidth(entity.name, false) + UI_METRICS.HEADER_PADDING_VERTICAL
  const labelTextHeight = entity.label
    ? estimateTextWidth(entity.label, false) + UI_METRICS.HEADER_PADDING_VERTICAL
    : 0
  const headerHeight = Math.max(nameTextHeight, labelTextHeight)

  // Высота ячеек атрибутов — зависит от наличия label
  const visibleAttrs = entity.attributes.slice(0, displayedCount)
  const hasAnyLabel = visibleAttrs.some(attr => attr.label)
  const cellsHeight = hasAnyLabel ? UI_METRICS.CELL_HEIGHT_WITH_LABEL : UI_METRICS.CELL_HEIGHT_BASE

  // Ширина видимых ячеек атрибутов + ячейка ellipsis
  const cellsWidth = visibleAttrs.reduce((sum, attr) => {
    return sum + calculateUiCellWidth(attr)
  }, 0) + (hasEllipsis ? UI_METRICS.CELL_MIN_WIDTH : 0)

  const width = headerWidth + cellsWidth + UI_METRICS.BORDER_WIDTH
  const height = Math.max(headerHeight, cellsHeight) + UI_METRICS.BORDER_WIDTH

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
    const dimensions = entity.type === 'ui'
      ? calculateUiNodeDimensions(entity)
      : calculateNodeDimensions(entity)
    dimensionsMap.set(entity.name, dimensions)
  })

  return dimensionsMap
}
