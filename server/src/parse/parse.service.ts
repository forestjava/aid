import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getDslParser, type ImportInfo, type ParsedEntities } from '../lib/dsl-parser';

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
   */
  private async getFilePath(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      // Если каталог - ищем файл index
      const indexPath = path.join(fullPath, 'index');

      await fs.access(indexPath);
      return indexPath;
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
      const resolvedContent = await this.resolveImports(
        fileContent,
        filePath,
        new Set(visitedFiles)
      );

      // Заменяем импорт на содержимое файла с комментарием
      const replacement =
        `\n// ===== BEGIN: ${imp.path} =====\n` +
        resolvedContent +
        `\n// ===== END: ${imp.path} =====\n`;

      resultContent =
        resultContent.substring(0, imp.position.start) +
        replacement +
        resultContent.substring(imp.position.end);
    }

    return resultContent;
  }

  /**
   * Парсит файл и возвращает текст с разрешенными импортами
   */
  async parseText(relativePath: string): Promise<{ path: string; content: string }> {
    const filePath = await this.getFilePath(relativePath);
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
  async parseJson(relativePath: string): Promise<{ path: string; entities: ParsedEntities }> {
    // Сначала получаем текст с разрешенными импортами
    const { content } = await this.parseText(relativePath);

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
}
