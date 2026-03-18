import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Stats } from 'fs';
import AdmZip from 'adm-zip';

@Injectable()
export class ZipBackupService {
  private readonly rootPath: string;

  constructor(private configService: ConfigService) {
    const configPath = this.configService.get<string>('FS_ROOT_PATH');
    if (!configPath) {
      throw new Error('FS_ROOT_PATH environment variable is required');
    }
    this.rootPath = path.resolve(process.cwd(), configPath);
  }

  async createZip(relativePath: string): Promise<Buffer> {
    const fullPath = path.resolve(this.rootPath, relativePath);

    let stat: Stats;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      throw new BadRequestException(`Path does not exist: ${relativePath}`);
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException(`Path is not a directory: ${relativePath}`);
    }

    const zip = new AdmZip();
    zip.addLocalFolder(fullPath);
    return zip.toBuffer();
  }
}
