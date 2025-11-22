import { Module } from '@nestjs/common';
import { FileSystemController } from './filesystem.controller';
import { FileSystemService } from './filesystem.service';

@Module({
  controllers: [FileSystemController],
  providers: [FileSystemService],
})
export class FileSystemModule {}

