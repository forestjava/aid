/**
 * Навигация по ссылкам в редакторе DSL
 */

import { parseApi } from '@/api/filesystem';

/**
 * Информация о ссылке для навигации
 */
export interface RefInfo {
  /** Полный текст ссылки (например, "ALIS/index" или "../shared/Type") */
  ref: string;
  /** Имя документа, из которого происходит навигация */
  source: string;
}

/**
 * Обработчик навигации по ссылке
 * @param refInfo - информация о ссылке
 * @returns true если навигация выполнена успешно
 */
export type NavigationHandler = (refInfo: RefInfo) => boolean | Promise<boolean>;

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
export function navigateToRef(refInfo: RefInfo): boolean | Promise<boolean> {
  return navigationHandler(refInfo);
}

/**
 * Обработчик навигации - вызывает API для резолва ссылки и открывает файл в новой вкладке
 */
async function defaultNavigationHandler(refInfo: RefInfo): Promise<boolean> {
  try {
    const result = await parseApi.navigate(refInfo.ref, refInfo.source);

    if (result.path) {
      // Открываем в новой вкладке браузера
      window.open(`/${result.path}`, '_blank');
      return true;
    }

    // Не найдено - игнорируем
    return false;
  } catch {
    // Ошибка API - игнорируем
    return false;
  }
}
