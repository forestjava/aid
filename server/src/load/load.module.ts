import { Module } from '@nestjs/common';
import { FileSystemModule } from '../filesystem/filesystem.module';
import { LoadController } from './load.controller';
import { Openapi3ConverterService } from './openapi3-converter.service';

@Module({
  imports: [FileSystemModule],
  controllers: [LoadController],
  providers: [Openapi3ConverterService],
})
export class LoadModule {}
