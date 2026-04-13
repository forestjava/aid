import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText, fetchFile, fetchAuthReference } from './fetchSource.js';
import { generateNestJsBackend } from './llmClient.js';
import { writeResultFile } from './writeResult.js';
import { parseFileOutput } from '../../shared/fileParser.js';

interface StartRequest { jobId: string; path: string; }
const MAX_RETRIES = 2;

async function processJob(jobId: string, sourcePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting NestJS backend generation...');

    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const dslContent = await fetchSourceText(sourcePath);

    await sendProgress(jobId, 'processing', 'Fetching Prisma schema...');
    const dir = sourcePath.replace(/\/[^/]+$/, '');
    const schemaPath = dir ? `${dir}/schema.prisma` : 'schema.prisma';
    const prismaSchema = await fetchFile(schemaPath);

    await sendProgress(jobId, 'processing', 'Fetching auth reference code...');
    const authReference = await fetchAuthReference();

    let rawOutput = '';
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const label = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : '';
      await sendProgress(jobId, 'processing', `Generating NestJS backend via LLM${label}...`);

      let prompt = dslContent;
      if (attempt > 0 && lastError) {
        prompt += `\n\n--- PREVIOUS ATTEMPT HAD ISSUES ---\n${lastError}\nPlease fix and regenerate.`;
      }

      rawOutput = await generateNestJsBackend(prompt, prismaSchema, authReference);
      const files = parseFileOutput(rawOutput);

      if (files.size === 0) {
        lastError = 'LLM output did not contain any ===FILE:=== markers.';
        if (attempt === MAX_RETRIES) throw new Error(`Backend generation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
        continue;
      }

      const hasAppModule = [...files.keys()].some(k => k.includes('app.module'));
      if (!hasAppModule) {
        lastError = 'Generated output is missing app.module.ts.';
        if (attempt === MAX_RETRIES) throw new Error(`Backend generation failed: ${lastError}`);
        continue;
      }

      await sendProgress(jobId, 'processing', `Writing ${files.size} backend files...`);
      for (const [filePath, content] of files) {
        const outputPath = dir ? `${dir}/backend/src/${filePath}` : `backend/src/${filePath}`;
        await writeResultFile(outputPath, content);
      }

      await sendProgress(jobId, 'completed', `Backend generated: ${files.size} files`);
      return;
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
  const { jobId, path: sourcePath } = req.body as StartRequest;
  if (!jobId || !sourcePath) { res.status(400).json({ error: 'jobId and path are required' }); return; }
  processJob(jobId, sourcePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => { res.json({ status: 'ok', runner: 'nestjs' }); });

app.listen(Number(config.PORT), () => { console.log(`runner-nestjs listening on port ${config.PORT}`); });
