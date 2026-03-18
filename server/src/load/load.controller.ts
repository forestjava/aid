import {
  Controller,
  Post,
  Get,
  Query,
  Header,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { Openapi3ConverterService } from './openapi3-converter.service';
import { FileSystemService } from '../filesystem/filesystem.service';
import { ZipExtractService } from './zip-extract.service';

@Controller('load')
export class LoadController {
  constructor(
    private readonly converter: Openapi3ConverterService,
    private readonly fs: FileSystemService,
    private readonly zipExtract: ZipExtractService,
  ) {}

  @Post('openapi3')
  @UseInterceptors(FileInterceptor('file'))
  async loadOpenapi3(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') targetPath: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required (field name: "file")');
    }
    if (!targetPath) {
      throw new BadRequestException('Query parameter "path" is required');
    }

    const yamlContent = file.buffer.toString('utf-8');
    const result = this.converter.convert(yamlContent);

    const dtoDir = `${targetPath}/dto`;
    await this.fs.rm(dtoDir, true);
    await this.fs.mkdir(dtoDir, true);

    for (const dto of result.dtoFiles) {
      await this.fs.writeFile(`${dtoDir}/${dto.name}`, dto.content);
    }

    await this.fs.writeFile(`${targetPath}/api`, result.apiContent);

    return {
      dtoFiles: result.dtoFiles.length,
      dtoCount: result.dtoCount,
      apiGroups: result.apiGroupCount,
    };
  }

  @Post('zip')
  @UseInterceptors(FileInterceptor('file'))
  async loadZip(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') targetPath: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required (field name: "file")');
    }
    if (!targetPath) {
      throw new BadRequestException('Query parameter "path" is required');
    }

    const result = await this.zipExtract.extractTo(file.buffer, targetPath);
    return result;
  }

  @Get('zip/form')
  @Header('Content-Type', 'text/html; charset=utf-8')
  zipUploadForm(): string {
    const htmlPath = path.join(__dirname, 'zip-form.html');
    return fs.readFileSync(htmlPath, 'utf-8');
  }

  @Get('openapi3/dmitry')
  @Header('Content-Type', 'text/html; charset=utf-8')
  dmitryUploadPage(): string {
    const htmlPath = path.join(__dirname, 'openapi3-form.html');
    return fs.readFileSync(htmlPath, 'utf-8');
  }
}
