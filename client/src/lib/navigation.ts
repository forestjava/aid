/**
 * Навигация по ссылкам в редакторе DSL
 */

/**
 * Информация о ссылке для навигации
 */
export interface RefInfo {
  /** Полный текст ссылки (например, "ALIS/index" или "../shared/Type") */
  ref: string;
  /** Позиция начала ссылки в документе */
  from: number;
  /** Позиция конца ссылки в документе */
  to: number;
}

/**
 * Обработчик навигации по ссылке
 * @param refInfo - информация о ссылке
 * @returns true если навигация выполнена успешно
 */
export type NavigationHandler = (refInfo: RefInfo) => boolean;

/**
 * Текущий обработчик навигации (можно заменить на реальную реализацию)
 */
let navigationHandler: NavigationHandler = defaultNavigationHandler;

/**
 * Устанавливает обработчик навигации
 */
export function setNavigationHandler(handler: NavigationHandler): void {
  navigationHandler = handler;
}

/**
 * Выполняет навигацию по ссылке
 */
export function navigateToRef(refInfo: RefInfo): boolean {
  return navigationHandler(refInfo);
}

/**
 * Fallback-обработчик навигации (заглушка)
 * TODO: Реализовать реальную навигацию к файлу/сущности
 */
function defaultNavigationHandler(refInfo: RefInfo): boolean {
  console.log('[Navigation] Переход к ссылке:', refInfo.ref);
  console.log('[Navigation] Позиция в документе:', refInfo.from, '-', refInfo.to);
  
  // Заглушка: показываем информацию о том, куда бы перешли
  // В будущем здесь будет реальная навигация:
  // - Открытие файла по пути
  // - Переход к определению сущности
  // - и т.д.
  
  return true;
}
