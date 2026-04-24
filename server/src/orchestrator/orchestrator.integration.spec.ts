import { TemplateService } from './template.service';

describe('Integration: Template Rendering', () => {
  const service = new TemplateService();

  it('should produce a complete project scaffold', async () => {
    const files = await service.renderTemplates({
      projectName: 'my-app',
      domain: 'my-app.greact.ru',
    });

    // Verify all expected files exist
    const expectedFiles = [
      'docker-compose.yml',
      'nginx/Dockerfile',
      'nginx/nginx.conf',
      '.env.example',
      'backend/Dockerfile',
      'backend/package.json',
      'backend/tsconfig.json',
      'backend/nest-cli.json',
      'backend/src/main.ts',
      'backend/src/prisma/prisma.service.ts',
      'backend/src/auth/auth.module.ts',
      'backend/src/auth/jwt.strategy.ts',
      'backend/src/auth/jwt-auth.guard.ts',
      'frontend/Dockerfile',
      'frontend/nginx.conf',
      'frontend/package.json',
      'frontend/vite.config.ts',
      'frontend/index.html',
      'frontend/src/authProvider.ts',
      'frontend/src/dataProvider.ts',
    ];

    for (const file of expectedFiles) {
      expect(files.has(file)).toBe(true);
      expect(files.get(file)!.length).toBeGreaterThan(0);
    }

    // Verify Handlebars substitution worked
    const compose = files.get('docker-compose.yml')!;
    expect(compose).toContain('my-app-postgres');
    expect(compose).toContain('my-app');
    expect(compose).not.toContain('{{');

    const nginx = files.get('nginx/nginx.conf')!;
    expect(nginx).toContain('my-app.greact.ru');

    const mainTs = files.get('backend/src/main.ts')!;
    expect(mainTs).toContain('my-app API');

    // Verify static files are intact
    const pkg = JSON.parse(files.get('backend/package.json')!);
    expect(pkg.dependencies['@nestjs/core']).toBeDefined();
    expect(pkg.dependencies['@prisma/client']).toBeDefined();

    const tsconfig = JSON.parse(files.get('backend/tsconfig.json')!);
    expect(tsconfig.compilerOptions.module).toBe('commonjs');

    // Verify authProvider reads Keycloak config from Vite env at runtime.
    const authProvider = files.get('frontend/src/authProvider.ts')!;
    expect(authProvider).toContain('import.meta.env.VITE_KEYCLOAK_URL');
    expect(authProvider).toContain('import.meta.env.VITE_KEYCLOAK_REALM');
    expect(authProvider).toContain('import.meta.env.VITE_KEYCLOAK_CLIENT_ID');

    // Verify backend Dockerfile uses dist/src/main (SWC output path)
    const backendDockerfile = files.get('backend/Dockerfile')!;
    expect(backendDockerfile).toContain('dist/src/main');

    // Verify nginx uses resolver for dynamic DNS
    const nginxConf = files.get('nginx/nginx.conf')!;
    expect(nginxConf).toContain('resolver 127.0.0.11');
    expect(nginxConf).toContain('set $backend');
  });
});
