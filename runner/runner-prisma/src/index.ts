import express from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generatePrismaSchemaAgentic } from './llmClient.js';
import { validatePrismaSchema } from './validator.js';

interface StartRequest {
  jobId: string;
  path: string;
  workspacePath: string;
  projectName: string;
}

const MAX_RETRIES = 2;

async function processJob(jobId: string, sourcePath: string, workspacePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting Prisma schema generation (agentic mode)...');

    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const sourceContent = await fetchSourceText(sourcePath);

    let lastError = '';
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const label = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : '';
      await sendProgress(jobId, 'processing', `Agentic loop${label}...`);

      let dsl = sourceContent;
      if (attempt > 0 && lastError) {
        dsl += `\n\n--- PREVIOUS ATTEMPT FAILED VALIDATION ---\n${lastError}\nWrite a corrected schema.prisma.`;
      }

      await generatePrismaSchemaAgentic(dsl, workspacePath, (m) => {
        sendProgress(jobId, 'processing', m);
      });

      const schemaPath = path.join(workspacePath, 'backend', 'prisma', 'schema.prisma');
      let schema: string;
      try {
        schema = await fs.readFile(schemaPath, 'utf-8');
      } catch {
        lastError = 'LLM did not write backend/prisma/schema.prisma';
        if (attempt === MAX_RETRIES) throw new Error(lastError);
        continue;
      }

      const result = validatePrismaSchema(schema);
      if (result.valid) {
        if (result.formatted && result.formatted !== schema) {
          await fs.writeFile(schemaPath, result.formatted, 'utf-8');
        }
        await sendProgress(jobId, 'completed', 'Schema generated and validated.');
        return;
      }

      lastError = result.error ?? 'Unknown validation error';
      if (attempt === MAX_RETRIES) {
        throw new Error(`Schema validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, message);
    await sendProgress(jobId, 'failed', message);
  }
}

const app = express();
app.use(express.json());

app.post('/start', (req, res) => {
  const { jobId, path: sourcePath, workspacePath } = req.body as StartRequest;
  if (!jobId || !sourcePath || !workspacePath) {
    res.status(400).json({ error: 'jobId, path, workspacePath are required' });
    return;
  }
  processJob(jobId, sourcePath, workspacePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', runner: 'prisma' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-prisma listening on port ${config.PORT}`);
});
