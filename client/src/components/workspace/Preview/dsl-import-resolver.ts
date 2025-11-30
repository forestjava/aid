import type { Node } from 'ohm-js';
import { dslGrammar } from '../../../lib/grammar';
import { filesystemApi } from '@/api/filesystem';

/**
 * Информация об импорте
 */
interface ImportInfo {
  keyword: string;
  path: string;
  fullText: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Семантика для извлечения импортов
 */
const semantics = dslGrammar.createSemantics();

semantics.addOperation<ImportInfo[]>('findImports', {
  _terminal(): ImportInfo[] {
    return [];
  },

  _iter(...children: any[]): ImportInfo[] {
    return children.flatMap(child => child.findImports());
  },

  Program(entities: any): ImportInfo[] {
    return entities.findImports();
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): ImportInfo[] {
    return [];
  },

  Entity_import(this: Node, importKeyword: any, importRef: any, _semicolon: any): ImportInfo[] {
    const keyword = importKeyword.sourceString;
    const path = importRef.sourceString.slice(1, -1); // Убираем кавычки

    const importInfo: ImportInfo = {
      keyword,
      path,
      fullText: this.sourceString,
      position: {
        start: this.source.startIdx,
        end: this.source.endIdx,
      },
    };

    return [importInfo];
  },

  Entity_simple(_keyword: any, _name: any, _semicolon: any): ImportInfo[] {
    return [];
  },

  Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): ImportInfo[] {
    return block.findImports();
  },

  Block(_open: any, items: any, _close: any): ImportInfo[] {
    return items.findImports();
  },

  Item(entity: any): ImportInfo[] {
    return entity.findImports();
  },
});

/**
 * Находит все импорты в DSL-коде
 */
function extractImports(content: string): ImportInfo[] {
  if (!content || content.trim() === '') {
    return [];
  }

  try {
    const match = dslGrammar.match(content);

    if (match.failed()) {
      const failurePos = match.getRightmostFailurePosition();
      const expected = match.getExpectedText();

      const lines = content.substring(0, failurePos).split('\n');
      const lineNumber = lines.length;
      const columnNumber = lines[lines.length - 1].length + 1;

      console.error(
        `Import extraction failed:\n` +
        `  Position: line ${lineNumber}, column ${columnNumber}\n` +
        `  Expected: ${expected}`
      );

      return [];
    }

    const adapter = semantics(match);
    return adapter.findImports();
  } catch (error) {
    console.error('Import extraction error:', error);
    return [];
  }
}

/**
 * Резолвит путь импорта относительно текущего файла
 */
function resolveImportPath(currentFilePath: string, importPath: string): string {
  // Если путь относительный (./ или ../), резолвим относительно текущего файла
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    const parts = importPath.split('/');
    const dirParts = currentDir.split('/').filter(p => p);

    for (const part of parts) {
      if (part === '.') {
        continue;
      } else if (part === '..') {
        dirParts.pop();
      } else {
        dirParts.push(part);
      }
    }

    return dirParts.join('/');
  }

  // Абсолютный путь - возвращаем как есть
  return importPath;
}

/**
 * Результат разрешения импортов
 */
export interface ResolveResult {
  content: string;
  error?: string;
}

/**
 * Разрешает все импорты в DSL-файле, заменяя их на содержимое
 * 
 * @param content - исходный DSL-код
 * @param currentPath - путь к текущему файлу (для резолва относительных путей)
 * @param visitedFiles - Set посещенных файлов (для предотвращения циклических зависимостей)
 * @returns обработанный контент со всеми развернутыми импортами
 */
export async function resolveImports(
  content: string,
  currentPath: string = '',
  visitedFiles: Set<string> = new Set()
): Promise<ResolveResult> {
  // Добавляем текущий файл в посещенные
  if (currentPath) {
    visitedFiles.add(currentPath);
  }

  // Находим все импорты
  const imports = extractImports(content);

  if (imports.length === 0) {
    return { content };
  }

  // Обрабатываем импорты в обратном порядке (от конца к началу),
  // чтобы позиции не сбивались при замене
  const sortedImports = [...imports].sort((a, b) => b.position.start - a.position.start);

  let resultContent = content;

  for (const imp of sortedImports) {
    const resolvedPath = resolveImportPath(currentPath, imp.path);

    // Проверка на циклические зависимости
    if (visitedFiles.has(resolvedPath)) {
      console.warn(`Circular dependency detected: ${resolvedPath}`);
      // Заменяем импорт на комментарий с предупреждением
      const replacement = `// CIRCULAR DEPENDENCY: ${imp.path}`;
      resultContent =
        resultContent.substring(0, imp.position.start) +
        replacement +
        resultContent.substring(imp.position.end);
      continue;
    }

    try {
      // Загружаем файл через filesystem API
      const fileResponse = await filesystemApi.readFile(resolvedPath);
      const fileContent = fileResponse.content;

      // Рекурсивно обрабатываем импорты в загруженном файле
      const resolvedFile = await resolveImports(
        fileContent,
        resolvedPath,
        new Set(visitedFiles) // Копируем Set для каждой ветки
      );

      if (resolvedFile.error) {
        console.error(`Error resolving imports in ${resolvedPath}:`, resolvedFile.error);
      }

      // Заменяем импорт на содержимое файла с комментарием
      const replacement =
        `\n// ===== BEGIN: ${imp.path} =====\n` +
        resolvedFile.content +
        `\n// ===== END: ${imp.path} =====\n`;

      resultContent =
        resultContent.substring(0, imp.position.start) +
        replacement +
        resultContent.substring(imp.position.end);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to load file ${resolvedPath}:`, errorMsg);

      // Заменяем импорт на комментарий с ошибкой
      const replacement = `// ERROR LOADING: ${imp.path} (${errorMsg})`;
      resultContent =
        resultContent.substring(0, imp.position.start) +
        replacement +
        resultContent.substring(imp.position.end);
    }
  }

  return { content: resultContent };
}

