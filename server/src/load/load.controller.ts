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
import { Openapi3ConverterService } from './openapi3-converter.service';
import { FileSystemService } from '../filesystem/filesystem.service';

@Controller('load')
export class LoadController {
  constructor(
    private readonly converter: Openapi3ConverterService,
    private readonly fs: FileSystemService,
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

  @Get('openapi3/dmitry')
  @Header('Content-Type', 'text/html; charset=utf-8')
  dmitryUploadPage(): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>OpenAPI3 → AID</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 60px auto; }
    h1 { font-size: 1.2em; }
    input, button { margin: 8px 0; }
    button { padding: 8px 20px; cursor: pointer; }
    #result { margin-top: 16px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Загрузка OpenAPI 3 → AID DSL</h1>
  <input type="file" id="file" accept=".yaml,.yml">
  <br>
  <button id="btn" onclick="upload()">Загрузить</button>
  <div id="result"></div>
  <script>
    async function upload() {
      const file = document.getElementById('file').files[0];
      if (!file) { alert('Выберите файл'); return; }
      const fd = new FormData();
      fd.append('file', file);
      document.getElementById('btn').disabled = true;
      document.getElementById('result').textContent = 'Загрузка...';
      try {
        const res = await fetch('/api/load/openapi3?path=Unknowns', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('result').textContent =
            'Готово!\\nDTO файлов: ' + data.dtoFiles +
            '\\nDTO всего: ' + data.dtoCount +
            '\\nAPI групп: ' + data.apiGroups;
        } else {
          document.getElementById('result').textContent = 'Ошибка: ' + (data.message || JSON.stringify(data));
        }
      } catch(e) {
        document.getElementById('result').textContent = 'Ошибка: ' + e.message;
      }
      document.getElementById('btn').disabled = false;
    }
  </script>
</body>
</html>`;
  }
}
