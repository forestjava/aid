import { Controller, Get, Query } from '@nestjs/common';
import { ParseService } from './parse.service';
import type { NavigateResult } from './parse.service';

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

  /**
   * Проверяет возможность навигации по ref-ссылке
   * и возвращает путь + позицию в файле
   * GET /parse/navigate?ref=Demo/Post.author&source=ALIS/index
   */
  @Get('navigate')
  async navigate(
    @Query('ref') ref: string = '',
    @Query('source') source: string = ''
  ): Promise<NavigateResult> {
    return await this.parseService.navigate(ref, source);
  }
}
