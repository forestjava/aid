import { Module } from '@nestjs/common';
import { FileSystemModule } from '../filesystem/filesystem.module';
import { BackupController } from './backup.controller';
import { ZipBackupService } from './zip-backup.service';

@Module({
  imports: [FileSystemModule],
  controllers: [BackupController],
  providers: [ZipBackupService],
})
export class BackupModule {}
