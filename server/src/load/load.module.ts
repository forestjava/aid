import { Module } from '@nestjs/common';
import { FileSystemModule } from '../filesystem/filesystem.module';
import { LoadController } from './load.controller';
import { Openapi3ConverterService } from './openapi3-converter.service';
import { ZipExtractService } from './zip-extract.service';

@Module({
  imports: [FileSystemModule],
  controllers: [LoadController],
  providers: [Openapi3ConverterService, ZipExtractService],
})
export class LoadModule {}
