import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';

@Injectable()
export class ZipExtractService {
  private readonly rootPath: string;

  constructor(private configService: ConfigService) {
    const configPath = this.configService.get<string>('FS_ROOT_PATH');
    if (!configPath) {
      throw new Error('FS_ROOT_PATH environment variable is required');
    }
    this.rootPath = path.resolve(process.cwd(), configPath);
  }

  async extractTo(
    buffer: Buffer,
    relativePath: string,
  ): Promise<{ filesCount: number }> {
    const targetPath = path.resolve(this.rootPath, relativePath);
    await fs.mkdir(targetPath, { recursive: true });

    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let filesCount = 0;

    for (const entry of entries) {
      if (entry.isDirectory) {
        continue;
      }

      let entryName = entry.entryName.replace(/\\/g, '/');
      if (entryName.includes('..')) {
        continue;
      }
      entryName = path.normalize(entryName);

      const destPath = path.join(targetPath, entryName);
      const parentDir = path.dirname(destPath);
      await fs.mkdir(parentDir, { recursive: true });

      const data = entry.getData();
      await fs.writeFile(destPath, data);
      filesCount++;
    }

    return { filesCount };
  }
}
