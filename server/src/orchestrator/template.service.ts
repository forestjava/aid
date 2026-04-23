import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface TemplateVars {
  projectName: string;
  domain: string;
  // Unique per generation. Injected into docker-compose build args so that
  // Docker cannot reuse a stale cached image layer on redeploy.
  cacheBust: string;
}

@Injectable()
export class TemplateService {
  // process.cwd() = /app/server in both dev and Docker production
  // __dirname doesn't work in production because it points to dist/src/orchestrator/
  private readonly templatesDir = path.join(process.cwd(), 'static-templates');

  async renderTemplates(vars: TemplateVars): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    await this.walkAndRender(this.templatesDir, '', vars, result);
    return result;
  }

  private async walkAndRender(
    dir: string,
    relativePath: string,
    vars: TemplateVars,
    result: Map<string, string>,
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.walkAndRender(fullPath, relPath, vars, result);
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');

        if (entry.name.endsWith('.hbs')) {
          const template = Handlebars.compile(content);
          const rendered = template(vars);
          const outputKey = relPath.replace(/\.hbs$/, '');
          result.set(outputKey, rendered);
        } else {
          result.set(relPath, content);
        }
      }
    }
  }
}
