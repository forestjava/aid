import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

// Имена файлов и каталогов в файловой системе = Идентификаторы
//
// Идентификатор может быть составным через точку (неограниченная вложенность)
// identifier = simpleIdentifier ("." simpleIdentifier)*
//
// Простой идентификатор начинается с буквы или "_" и содержит буквы/цифры
// simpleIdentifier = ("_" | letter) (letter | digit | "_")*

const LETTER = '[a-zA-Zа-яА-ЯёЁ]';
const LETTER_OR_DIGIT_OR_UNDERSCORE = '[a-zA-Zа-яА-ЯёЁ0-9_]';
const SIMPLE_IDENTIFIER = `(?:_|${LETTER})${LETTER_OR_DIGIT_OR_UNDERSCORE}*`;
const IDENTIFIER = `${SIMPLE_IDENTIFIER}(\\.${SIMPLE_IDENTIFIER})*`;

const VALID_IDENTIFIER_REGEX = new RegExp(`^${IDENTIFIER}$`);

@Injectable()
export class FileSystemService {
  private readonly rootPath: string;

  constructor(private configService: ConfigService) {
    const configPath = this.configService.get<string>('FS_ROOT_PATH');
    if (!configPath) {
      throw new Error('FS_ROOT_PATH environment variable is required');
    }
    this.rootPath = path.resolve(process.cwd(), configPath);
  }

  /**
   * Проверяет, является ли имя валидным идентификатором DSL.
   * Формат: simpleIdentifier ("." simpleIdentifier)*
   * где simpleIdentifier начинается с буквы или "_" и содержит буквы, цифры и _.
   */
  private validateIdentifierName(name: string, context: string): void {
    if (!name) {
      throw new BadRequestException(`${context}: имя не может быть пустым`);
    }
    if (!VALID_IDENTIFIER_REGEX.test(name)) {
      throw new BadRequestException(
        `${context}: "${name}" не является валидным идентификатором.`
      );
    }
  }

  /**
   * Извлекает имя файла или каталога из пути
   */
  private getBaseName(relativePath: string): string {
    return path.basename(relativePath);
  }

  private resolvePath(relativePath: string): string {
    const fullPath = path.resolve(this.rootPath, relativePath);
    // Basic protection against path traversal
    if (!fullPath.startsWith(this.rootPath)) {
      throw new Error('Access denied: path is outside root directory');
    }
    return fullPath;
  }

  async readdir(relativePath: string) {
    const fullPath = this.resolvePath(relativePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    }));
  }

  async readFile(relativePath: string) {
    const fullPath = this.resolvePath(relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  }

  async stat(relativePath: string) {
    const fullPath = this.resolvePath(relativePath);
    const stats = await fs.stat(fullPath);
    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
    };
  }

  async createFile(relativePath: string, content: string) {
    const fileName = this.getBaseName(relativePath);
    this.validateIdentifierName(fileName, 'Создание файла');

    const fullPath = this.resolvePath(relativePath);
    await fs.writeFile(fullPath, content, { encoding: 'utf-8', flag: 'wx' });
    return { path: relativePath };
  }

  async updateFile(relativePath: string, content: string) {
    const fullPath = this.resolvePath(relativePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    return { path: relativePath };
  }

  async writeFile(relativePath: string, content: string) {
    return this.updateFile(relativePath, content);
  }

  async mkdir(relativePath: string, recursive = true) {
    const dirName = this.getBaseName(relativePath);
    this.validateIdentifierName(dirName, 'Создание каталога');

    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(fullPath, { recursive });
    return { path: relativePath };
  }

  async rename(oldPath: string, newPath: string) {
    const newName = this.getBaseName(newPath);
    this.validateIdentifierName(newName, 'Переименование');

    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);

    // Проверка существования файла/папки в месте назначения
    const destExists = await this.exists(newPath);
    if (destExists.exists) {
      throw new ConflictException(
        `Destination path already exists: ${newPath}`
      );
    }

    await fs.rename(fullOldPath, fullNewPath);
    return { oldPath, newPath };
  }

  async move(sourcePath: string, destinationPath: string) {
    return this.rename(sourcePath, destinationPath);
  }

  async rm(relativePath: string, recursive = true) {
    const fullPath = this.resolvePath(relativePath);
    await fs.rm(fullPath, { recursive, force: true });
    return { path: relativePath };
  }

  async exists(relativePath: string) {
    const fullPath = this.resolvePath(relativePath);
    return fs.stat(fullPath)
      .then((stats) => ({
        exists: true,
        isDirectory: stats.isDirectory(),
      }))
      .catch(() => ({
        exists: false,
      }));
  }
}

