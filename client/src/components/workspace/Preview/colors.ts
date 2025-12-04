// Палитра цветов для визуализации связей в ERD
// Цвета подобраны так, чтобы быть явно различимыми друг от друга

export const EDGE_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
  '#84cc16', // lime-500
  '#f43f5e', // rose-500
  '#0ea5e9', // sky-500
  '#eab308', // yellow-500
  '#22c55e', // green-600
  '#dc2626', // red-600
  '#2563eb', // blue-600
  '#9333ea', // purple-600
  '#db2777', // pink-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  // Дополнительные цвета для лучшей различимости
  '#fb923c', // orange-400
  '#34d399', // emerald-400
  '#c084fc', // purple-400
  '#fb7185', // rose-400
  '#60a5fa', // blue-400
  '#fbbf24', // amber-400
  '#4ade80', // green-400
  '#e879f9', // fuchsia-400
  '#38bdf8', // sky-400
  '#facc15', // yellow-400
  '#818cf8', // indigo-400
  '#2dd4bf', // teal-400
  '#f472b6', // pink-400
  '#a3e635', // lime-400
  '#22d3ee', // cyan-400
  '#be185d', // pink-700
  '#b91c1c', // red-700
  '#15803d', // green-700
  '#1d4ed8', // blue-700
  '#6d28d9', // violet-700
  '#0369a1', // sky-700
  '#b45309', // amber-700
  '#0f766e', // teal-700
  '#a21caf', // fuchsia-700
  '#4338ca', // indigo-700
  '#9f1239', // rose-700
  '#047857', // emerald-700
] as const

/**
 * Получить цвет для связи по индексу
 * Цвета используются циклически
 */
export const getEdgeColor = (index: number): string => {
  return EDGE_COLORS[index % EDGE_COLORS.length]
}

