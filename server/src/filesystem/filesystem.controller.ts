import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileSystemService } from './filesystem.service';

@Controller('fs')
export class FileSystemController {
  constructor(private readonly fileSystemService: FileSystemService) {}

  @Get('readdir')
  async readdir(@Query('path') path: string = '') {
    const items = await this.fileSystemService.readdir(path);
    return { path, items };
  }

  @Get('readFile')
  async readFile(@Query('path') path: string) {
    const content = await this.fileSystemService.readFile(path);
    return { path, content };
  }

  @Get('stat')
  async stat(@Query('path') path: string) {
    const stats = await this.fileSystemService.stat(path);
    return { path, ...stats };
  }

  @Post('writeFile')
  async writeFile(@Body() body: { path: string; content: string }) {
    return await this.fileSystemService.writeFile(body.path, body.content);
  }

  @Post('mkdir')
  async mkdir(@Body() body: { path: string; recursive?: boolean }) {
    return await this.fileSystemService.mkdir(body.path, body.recursive);
  }

  @Put('rename')
  async rename(@Body() body: { oldPath: string; newPath: string }) {
    return await this.fileSystemService.rename(body.oldPath, body.newPath);
  }

  @Delete('rm')
  async rm(
    @Query('path') path: string,
    @Query('recursive', new DefaultValuePipe(true), ParseBoolPipe) recursive: boolean,
  ) {
    return await this.fileSystemService.rm(path, recursive);
  }

  @Get('exists')
  async exists(@Query('path') path: string) {
    const result = await this.fileSystemService.exists(path);
    return { path, ...result };
  }
}

