import {
  Controller,
  Get,
  Query,
  Header,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ZipBackupService } from './zip-backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly zipBackup: ZipBackupService) {}

  @Get('zip')
  async downloadZip(@Query('path') targetPath: string): Promise<StreamableFile> {
    if (!targetPath) {
      throw new BadRequestException('Query parameter "path" is required');
    }

    const buffer = await this.zipBackup.createZip(targetPath);
    const filename = path.basename(targetPath) || 'backup';
    const safeFilename = `${filename}.zip`;

    return new StreamableFile(buffer, {
      type: 'application/zip',
      disposition: `attachment; filename="${safeFilename}"`,
    });
  }

  @Get('zip/form')
  @Header('Content-Type', 'text/html; charset=utf-8')
  backupForm(): string {
    const htmlPath = path.join(__dirname, 'backup-form.html');
    return fs.readFileSync(htmlPath, 'utf-8');
  }
}
