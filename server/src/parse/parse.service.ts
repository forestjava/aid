import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getDslParser, type ImportInfo, type ParsedEntities } from '../lib/dsl-parser';

/**
 * Результат навигации по ref-ссылке
 */
export interface NavigateResult {
  path: string | null;
  position?: {
    line: number;
    column: number;
  };
  error?: string;
}

@Injectable()
export class ParseService {
  private readonly rootPath: string;
  private readonly parser = getDslParser();

  constructor(private configService: ConfigService) {
    const configPath = this.configService.get<string>('FS_ROOT_PATH');
    if (!configPath) {
      throw new Error('FS_ROOT_PATH environment variable is required');
    }
    this.rootPath = path.resolve(process.cwd(), configPath);
  }

  /**
   * Резолвит путь - защита от traversal
   */
  private resolvePath(relativePath: string): string {
    const fullPath = path.resolve(this.rootPath, relativePath);

    // Защита от path traversal
    if (!fullPath.startsWith(this.rootPath)) {
      throw new BadRequestException('Access denied: path is outside root directory');
    }

    return fullPath;
  }

  /**
   * Получает путь к файлу (добавляет index если это каталог)
   * Возвращает null если это каталог без index-файла
   */
  private async getFilePath(relativePath: string): Promise<string | null> {
    const fullPath = this.resolvePath(relativePath);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      // Если каталог - ищем файл index
      const indexPath = path.join(fullPath, 'index');

      try {
        await fs.access(indexPath);
        return indexPath;
      } catch {
        // Index-файл не найден — это нормально для каталога
        return null;
      }
    }

    return fullPath;
  }

  /**
   * Резолвит путь импорта относительно текущего файла
   */
  private resolveImportPath(currentFilePath: string, importPath: string): string {
    // Если путь относительный (./ или ../), резолвим относительно текущего файла
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = path.dirname(currentFilePath);
      return path.join(currentDir, importPath);
    }

    // Абсолютный путь (относительно rootPath)
    return path.join(this.rootPath, importPath);
  }

  /**
   * Рекурсивно резолвит все импорты в контенте
   */
  private async resolveImports(
    content: string,
    currentPath: string,
    visitedFiles: Set<string> = new Set()
  ): Promise<string> {
    // Добавляем текущий файл в посещенные
    visitedFiles.add(currentPath);

    // Находим все импорты
    const imports: ImportInfo[] = this.parser.extractImports(content);

    if (imports.length === 0) {
      return content;
    }

    // Обрабатываем импорты в обратном порядке (от конца к началу)
    const sortedImports = [...imports].sort((a, b) => b.position.start - a.position.start);

    let resultContent = content;

    for (const imp of sortedImports) {
      const resolvedPath = this.resolveImportPath(currentPath, imp.path);

      // Проверка на циклические зависимости
      if (visitedFiles.has(resolvedPath)) {
        const replacement = `// CIRCULAR DEPENDENCY: ${imp.path}`;
        resultContent =
          resultContent.substring(0, imp.position.start) +
          replacement +
          resultContent.substring(imp.position.end);
        continue;
      }

      // Получаем путь к файлу (с учетом каталогов)
      let filePath: string;
      const stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) {
        filePath = path.join(resolvedPath, 'index');
      } else {
        filePath = resolvedPath;
      }

      // Читаем файл
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // Рекурсивно обрабатываем импорты
      let resolvedContent = await this.resolveImports(
        fileContent,
        filePath,
        new Set(visitedFiles)
      );

      // Фильтрация по селектору (#EntityName)
      if (imp.selector) {
        const blocks = this.parser.extractNamedBlocks(resolvedContent);
        const matching = blocks.filter(b =>
          b.name === imp.selector || b.name.endsWith('.' + imp.selector)
        );
        if (matching.length > 0) {
          resolvedContent = matching.map(b => b.text).join('\n\n');
        } else {
          resolvedContent = `// WARNING: entity "${imp.selector}" not found in ${imp.path}`;
        }
      }

      // Вычисляем отступ перед import (пробелы/табы от начала строки)
      const lineStart = resultContent.lastIndexOf('\n', imp.position.start - 1) + 1;
      const indent = resultContent.substring(lineStart, imp.position.start).match(/^(\s*)/)?.[1] || '';

      // Добавляем отступ к каждой строке импортируемого контента
      const indentedContent = resolvedContent
        .split('\n')
        .map(line => indent + line)
        .join('\n');

      const importComment = imp.selector
        ? `// imported ${imp.selector} from ${imp.path}`
        : `// imported from ${imp.path}`;
      const replacement = `${importComment}\n${indentedContent}\n`;

      resultContent =
        resultContent.substring(0, imp.position.start) +
        replacement +
        resultContent.substring(imp.position.end);
    }

    return resultContent;
  }

  /**
   * Парсит файл и возвращает текст с разрешенными импортами
   * Для каталога без index-файла возвращает content: null
   */
  async parseText(relativePath: string): Promise<{ path: string; content: string | null }> {
    const filePath = await this.getFilePath(relativePath);

    if (filePath === null) {
      // Каталог без index-файла
      return { path: relativePath, content: null };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const resolvedContent = await this.resolveImports(content, filePath);

    return {
      path: relativePath,
      content: resolvedContent,
    };
  }

  /**
   * Парсит файл и возвращает JSON с entities и их атрибутами
   */
  async parseJson(relativePath: string): Promise<{ path: string; entities: ParsedEntities | null }> {
    // Сначала получаем текст с разрешенными импортами
    const { content } = await this.parseText(relativePath);

    if (content === null) {
      // Каталог без index-файла
      return { path: relativePath, entities: null };
    }

    // Парсим контент
    const result = this.parser.parseEntities(content);

    if ('error' in result) {
      throw new BadRequestException(
        `Parsing failed at line ${result.line}. ${result.error}`
      );
    }

    return {
      path: relativePath,
      entities: result.entities,
    };
  }

  /**
   * Проверяет существование файла или каталога
   */
  private async fileExists(fullPath: string): Promise<{ exists: boolean; isDirectory: boolean }> {
    try {
      const stats = await fs.stat(fullPath);
      return { exists: true, isDirectory: stats.isDirectory() };
    } catch {
      return { exists: false, isDirectory: false };
    }
  }

  /**
   * Резолвит ref-путь относительно source документа
   * Возвращает полный путь в файловой системе
   */
  private resolveRefPath(refPath: string, source: string): string {
    // Если начинается с / - это абсолютный путь от корня
    if (refPath.startsWith('/')) {
      return path.join(this.rootPath, refPath.substring(1));
    }

    // Если относительный (./ или ../) - резолвим относительно source
    if (refPath.startsWith('./') || refPath.startsWith('../')) {
      const sourceDir = path.dirname(path.join(this.rootPath, source));
      return path.resolve(sourceDir, refPath);
    }

    // Иначе - от корня rootPath
    return path.join(this.rootPath, refPath);
  }

  /**
   * Парсит ref и разделяет на части: путь к файлу и путь к entity/атрибуту
   * Итеративно проверяет существование файлов от самого длинного пути к короткому
   *
   * ref = "Demo/Post.author.name"
   * Проверяет: Demo/Post.author.name -> Demo/Post.author -> Demo/Post -> Demo
   * Первый существующий становится filePath, остальное - entityPath
   */
  private async parseRefParts(
    ref: string,
    source: string
  ): Promise<{ filePath: string | null; entityPath: string[]; relativePath: string | null }> {
    // Извлекаем prefix (/, ./, ../) если есть
    let prefix = '';
    let refBody = ref;

    if (ref.startsWith('/')) {
      prefix = '/';
      refBody = ref.substring(1);
    } else if (ref.startsWith('./')) {
      prefix = './';
      refBody = ref.substring(2);
    } else {
      const match = ref.match(/^((?:\.\.\/)+)/);
      if (match) {
        prefix = match[1];
        refBody = ref.substring(prefix.length);
      }
    }

    // Разделяем по / для получения сегментов пути
    const segments = refBody.split('/');

    // Последний сегмент может содержать точки для атрибутов
    // Например: "Post.author.name" -> ["Post", "author", "name"]
    const lastSegment = segments[segments.length - 1];
    const identifierParts = lastSegment.split('.');

    // Собираем все возможные комбинации пути
    // Начинаем с самого длинного (все части как путь) и идём к самому короткому
    const pathCandidates: { pathPart: string; entityPart: string[] }[] = [];

    // Генерируем кандидатов: от полного пути до минимального
    for (let i = identifierParts.length; i >= 1; i--) {
      const pathSegments = [...segments.slice(0, -1), identifierParts.slice(0, i).join('.')];
      const pathPart = prefix + pathSegments.join('/');
      const entityPart = identifierParts.slice(i);

      pathCandidates.push({ pathPart, entityPart });
    }

    // Добавляем варианты без последнего сегмента, если есть другие сегменты
    if (segments.length > 1) {
      for (let i = segments.length - 1; i >= 1; i--) {
        const pathPart = prefix + segments.slice(0, i).join('/');
        const entityPart = [
          ...segments.slice(i, -1),
          ...identifierParts,
        ];

        pathCandidates.push({ pathPart, entityPart });
      }
    }

    // Проверяем каждого кандидата на существование файла
    for (const candidate of pathCandidates) {
      const fullPath = this.resolveRefPath(candidate.pathPart, source);

      // Защита от path traversal
      if (!fullPath.startsWith(this.rootPath)) {
        continue;
      }

      const { exists, isDirectory } = await this.fileExists(fullPath);

      if (exists) {
        let finalPath = fullPath;

        // Если это каталог - проверяем index
        if (isDirectory) {
          const indexPath = path.join(fullPath, 'index');
          const indexExists = await this.fileExists(indexPath);

          if (indexExists.exists && !indexExists.isDirectory) {
            finalPath = indexPath;
          } else {
            continue; // Каталог без index - пропускаем
          }
        }

        // Вычисляем относительный путь для ответа
        const relativePath = path.relative(this.rootPath, isDirectory ? fullPath : finalPath);

        return {
          filePath: finalPath,
          entityPath: candidate.entityPart,
          relativePath: relativePath.replace(/\\/g, '/'), // Нормализуем слеши для Windows
        };
      }
    }

    return { filePath: null, entityPath: [], relativePath: null };
  }

  /**
   * Проверяет возможность навигации по ref-ссылке и возвращает путь + позицию
   *
   * @param ref - ref-ссылка (например: "Demo/Post.author", "../shared/Type")
   * @param source - путь документа-источника для резолва относительных путей
   */
  async navigate(ref: string, source: string): Promise<NavigateResult> {
    if (!ref || ref.trim() === '') {
      return { path: null, error: 'Empty ref' };
    }

    // Парсим ref на части
    const { filePath, entityPath, relativePath } = await this.parseRefParts(ref, source);

    if (!filePath || !relativePath) {
      return { path: null, error: `File not found for ref: ${ref}` };
    }

    // Если нет entityPath - просто возвращаем путь к файлу
    if (entityPath.length === 0) {
      return {
        path: relativePath,
        position: { line: 1, column: 1 },
      };
    }

    // Читаем файл и ищем позицию entity/атрибута
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const definitionInfo = this.parser.findDefinitionPosition(content, entityPath);

      if (!definitionInfo) {
        return {
          path: relativePath,
          error: `Definition '${entityPath.join('.')}' not found in ${relativePath}`,
        };
      }

      return {
        path: relativePath,
        position: {
          line: definitionInfo.line,
          column: definitionInfo.column,
        },
      };
    } catch (err) {
      return {
        path: relativePath,
        error: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
