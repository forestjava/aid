import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    service = new TemplateService();
  });

  describe('renderTemplates', () => {
    it('should render .hbs files with project variables', async () => {
      const result = await service.renderTemplates({
        projectName: 'test-project',
        domain: 'test.greact.ru',
      });

      // Result is a Map<relativePath, content>
      expect(result.size).toBeGreaterThan(0);

      // docker-compose should have project name substituted
      const compose = result.get('docker-compose.yml');
      expect(compose).toBeDefined();
      expect(compose).toContain('test-project-postgres');
      expect(compose).not.toContain('{{projectName}}');

      // .env.example should have domain
      const env = result.get('.env.example');
      expect(env).toBeDefined();
      expect(env).toContain('test-project');

      // Static files (non-.hbs) should be copied as-is
      const tsconfig = result.get('backend/tsconfig.json');
      expect(tsconfig).toBeDefined();
      expect(tsconfig).toContain('"module": "ESNext"');

      // .hbs extension should be stripped from output keys
      expect(result.has('docker-compose.yml')).toBe(true);
      expect(result.has('docker-compose.yml.hbs')).toBe(false);
    });
  });
});
