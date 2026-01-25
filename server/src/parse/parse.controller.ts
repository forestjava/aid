import { Controller, Get, Query } from '@nestjs/common';
import { ParseService } from './parse.service';

@Controller('parse')
export class ParseController {
  constructor(private readonly parseService: ParseService) { }

  /**
   * Возвращает текст файла с разрешенными импортами
   * GET /parse/text?path=file.dsl
   */
  @Get('text')
  async parseText(@Query('path') path: string = '') {
    return await this.parseService.parseText(path);
  }

  /**
   * Возвращает JSON с entities и их атрибутами
   * GET /parse/json?path=file.dsl
   */
  @Get('json')
  async parseJson(@Query('path') path: string = '') {
    return await this.parseService.parseJson(path);
  }
}
