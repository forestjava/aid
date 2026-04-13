import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generatePrismaSchema } from './llmClient.js';
import { validatePrismaSchema } from './validator.js';
import { writeResultFile } from './writeResult.js';

interface StartRequest {
  jobId: string;
  path: string;
}

const MAX_RETRIES = 2;

function deriveOutputPath(sourcePath: string): string {
  const lastSlash = sourcePath.lastIndexOf('/');
  if (lastSlash === -1) return 'schema.prisma'; // file in root → schema.prisma in root
  const dir = sourcePath.substring(0, lastSlash);
  return `${dir}/schema.prisma`;
}

async function processJob(jobId: string, sourcePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting Prisma schema generation...');

    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const sourceContent = await fetchSourceText(sourcePath);

    let schema: string = '';
    let lastError: string = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const attemptLabel = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : '';
      await sendProgress(jobId, 'processing', `Generating Prisma schema via LLM${attemptLabel}...`);

      let prompt = sourceContent;
      if (attempt > 0 && lastError) {
        prompt += `\n\n--- PREVIOUS ATTEMPT FAILED VALIDATION ---\nError: ${lastError}\nPlease fix the schema and try again.`;
      }

      schema = await generatePrismaSchema(prompt);

      await sendProgress(jobId, 'processing', `Validating schema${attemptLabel}...`);
      const result = validatePrismaSchema(schema);

      if (result.valid) {
        schema = result.formatted ?? schema;
        break;
      }

      lastError = result.error ?? 'Unknown validation error';
      console.warn(`Validation failed (attempt ${attempt + 1}): ${lastError}`);

      if (attempt === MAX_RETRIES) {
        throw new Error(`Schema validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
      }
    }

    const outputPath = deriveOutputPath(sourcePath);
    await sendProgress(jobId, 'processing', 'Writing schema.prisma...');
    await writeResultFile(outputPath, schema);

    await sendProgress(jobId, 'completed', `Schema generated and validated: ${outputPath}`);
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

  if (!jobId || !sourcePath) {
    res.status(400).json({ error: 'jobId and path are required' });
    return;
  }

  processJob(jobId, sourcePath);
  res.status(202).json({ received: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', runner: 'prisma' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-prisma listening on port ${config.PORT}`);
});
