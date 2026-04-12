import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
}

export function validatePrismaSchema(schemaContent: string): ValidationResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-validate-'));
  const schemaPath = path.join(tmpDir, 'schema.prisma');

  try {
    fs.writeFileSync(schemaPath, schemaContent, 'utf-8');

    // Run prisma validate
    try {
      execSync(`npx prisma validate --schema="${schemaPath}"`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe',
      });
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; stdout?: Buffer };
      const stderr = error.stderr?.toString() ?? '';
      const stdout = error.stdout?.toString() ?? '';
      return { valid: false, error: stderr || stdout || 'Unknown validation error' };
    }

    // Run prisma format
    try {
      execSync(`npx prisma format --schema="${schemaPath}"`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe',
      });
      const formatted = fs.readFileSync(schemaPath, 'utf-8');
      return { valid: true, formatted };
    } catch {
      return { valid: true, formatted: schemaContent };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
