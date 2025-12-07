import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    const fullPath = this.resolvePath(relativePath);
    await fs.writeFile(fullPath, content, { encoding: 'utf-8', flag: 'wx' });
    return { path: relativePath };
  }

  async updateFile(relativePath: string, content: string) {
    const fullPath = this.resolvePath(relativePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    return { path: relativePath };
  }

  async mkdir(relativePath: string, recursive = true) {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(fullPath, { recursive });
    return { path: relativePath };
  }

  async rename(oldPath: string, newPath: string) {
    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);
    await fs.rename(fullOldPath, fullNewPath);
    return { oldPath, newPath };
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

