import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
}

// Use prisma from runner's own node_modules, not npx (which tries to download)
const PRISMA_BIN = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');

export function validatePrismaSchema(schemaContent: string): ValidationResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-validate-'));
  const schemaPath = path.join(tmpDir, 'schema.prisma');

  try {
    fs.writeFileSync(schemaPath, schemaContent, 'utf-8');

    // Run prisma validate
    try {
      const output = execSync(`${PRISMA_BIN} validate --schema="${schemaPath}"`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe',
        env: {
          ...process.env,
          PRISMA_HIDE_UPDATE_MESSAGE: '1',
          // Prisma 6 validate requires DATABASE_URL even for syntax check
          DATABASE_URL: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
        },
      });
      console.log('Prisma validate passed:', output.toString().trim());
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
      const stderr = error.stderr?.toString() ?? '';
      const stdout = error.stdout?.toString() ?? '';
      const msg = stderr || stdout || error.message || 'Unknown validation error';
      console.warn('Prisma validate error:', msg.slice(0, 500));
      return { valid: false, error: msg };
    }

    // Run prisma format
    try {
      execSync(`${PRISMA_BIN} format --schema="${schemaPath}"`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe',
        env: {
          ...process.env,
          PRISMA_HIDE_UPDATE_MESSAGE: '1',
          DATABASE_URL: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
        },
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
