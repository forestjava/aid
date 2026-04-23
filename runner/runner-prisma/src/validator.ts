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

// Every model MUST have a field declared with `@id` (single-column primary key).
// Composite keys (`@@id([a, b])`) are rejected — they break the frontend sort/lookup.
function validateIdFields(schema: string): string | null {
  const modelRegex = /\bmodel\s+(\w+)\s*\{([^}]*)\}/g;
  const missing: string[] = [];
  const composite: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(schema)) !== null) {
    const [, name, body] = match;
    const hasAtId = /^\s*\w+\s+\S+[^\n]*\s@id\b/m.test(body);
    const hasAtAtId = /^\s*@@id\s*\(/m.test(body);

    if (hasAtAtId && !hasAtId) composite.push(name);
    if (!hasAtId) missing.push(name);
  }

  const errors: string[] = [];
  if (missing.length > 0) {
    errors.push(
      `The following models have no \`id\` field with \`@id\`: ${missing.join(', ')}. ` +
      `Every model MUST have \`id Int @id @default(autoincrement())\` or \`id String @id @default(uuid())\`.`,
    );
  }
  if (composite.length > 0) {
    errors.push(
      `The following models use a composite primary key (\`@@id\`): ${composite.join(', ')}. ` +
      `Composite keys are forbidden — replace with a surrogate \`id\` and add a compound \`@@unique\` instead.`,
    );
  }
  return errors.length > 0 ? errors.join('\n') : null;
}

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

    const idError = validateIdFields(schemaContent);
    if (idError) {
      console.warn('Field-contract violation:', idError);
      return { valid: false, error: idError };
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
