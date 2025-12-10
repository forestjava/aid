/**
 * Модуль стилизации для визуализации схем БД
 * Содержит всю логику определения цветов и стилей для связей и атрибутов
 */

import type { EntityRelation, EntityAttribute, SchemeContext } from './types'
import { getEdgeColor as getColorFromPalette } from './colors'

/**
 * Получить стиль для связи (edge)
 * @param relation - связь
 * @param schemeContext - контекст схемы (общие параметры)
 * @returns объект стиля для ReactFlow Edge (включая цвет)
 */
export function getEdgeStyle(relation: EntityRelation, schemeContext: SchemeContext) {
  const isExternal = relation.type === 'external'
  const { hasExternalRelations } = schemeContext
  
  // Если есть external связи, раскрашиваем только их, иначе раскрашиваем все
  const shouldColor = hasExternalRelations ? isExternal : true
  const color = shouldColor ? getColorFromPalette(relation.paletteIndex) : undefined;
  
  return {
    animated: isExternal,
    style: {
      strokeWidth: isExternal ? 1 : 2,
      stroke: color,
      strokeDasharray: isExternal ? '5,5' : undefined,
    },
  }
}

/**
 * Получить стиль для атрибута
 * @param attribute - атрибут
 * @param schemeContext - контекст схемы (общие параметры)
 * @returns объект стиля для атрибута (включая цвет) или undefined
 */
export function getAttributeStyle(
  attribute: EntityAttribute,
  schemeContext: SchemeContext
): { color: string } | undefined {
  // Если атрибут не имеет связи, не раскрашиваем
  if (attribute.paletteIndex === undefined) {
    return undefined
  }

  const isExternalAttribute = attribute.syncTarget !== undefined
  const { hasExternalRelations } = schemeContext
  
  // Если есть external связи в схеме, раскрашиваем только атрибуты external связей
  if (hasExternalRelations) {
    return isExternalAttribute ? { color: getColorFromPalette(attribute.paletteIndex) } : undefined
  }
  
  // Если нет external связей, раскрашиваем все атрибуты с paletteIndex
  return { color: getColorFromPalette(attribute.paletteIndex) }
}

