import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceContent } from './fetchSource.js';
import { generateWithLLM } from './llmClient.js';
import { writeResultFile } from './writeResult.js';

const app = express();
app.use(express.json());

function sanitizeLlmOutput(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '');
  const fencedBlocks = [...text.matchAll(/```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```/g)];
  if (fencedBlocks.length > 0) {
    const last = fencedBlocks[fencedBlocks.length - 1];
    text = last[1];
  }
  text = text.replace(/^[\s\u00A0\u200B\u2028\u2029]+/, '');
  text = text.replace(/[\s\u00A0\u200B\u2028\u2029]+$/, '');
  return text;
}

interface StartRequest {
  jobId: string;
  path: string;
}

function deriveOutputPath(sourcePath: string): string {
  const dot = sourcePath.lastIndexOf('.');
  const base = dot > 0 ? sourcePath.substring(0, dot) : sourcePath;
  return `${base}.api`;
}

async function processJob(jobId: string, path: string): Promise<void> {
  console.log(`[${jobId}] Path: ${path}`);

  try {
    await sendProgress(jobId, 'started', 'Задача принята к исполнению');

    // 1. Fetch source DSL
    await sendProgress(jobId, 'processing', 'Получение исходного текста');
    const sourceContent = await fetchSourceContent(path);
    const lineCount = sourceContent.split('\n').length;
    console.log(`[${jobId}] Fetched ${lineCount} lines from ${path}`);

    // 2. Validate input
    const inputEnabled = process.env.CRUD_INPUT_VALIDATION_ENABLED !== 'false';
    if (inputEnabled) {
      await sendProgress(jobId, 'processing', 'Валидация входного DSL');
      const { validateInputSource } = await import('./validator/index.ts');
      const inp = validateInputSource(sourceContent);
      if (!inp.ok) {
        const payload = JSON.stringify({
          stage: inp.parseErrors.length > 0 ? 'input-parse' : 'input-validation',
          errors: inp.parseErrors.length > 0 ? inp.parseErrors : inp.issues,
        });
        await sendProgress(jobId, 'failed', payload);
        return;
      }
    }

    // 3. LLM
    await sendProgress(jobId, 'processing', 'Обращение к LLM');
    const llmResultRaw = await generateWithLLM(sourceContent);
    console.log(`[${jobId}] LLM response: ${llmResultRaw.length} characters`);
    console.log(`[${jobId}] LLM head: ${JSON.stringify(llmResultRaw.slice(0, 200))}`);
    console.log(`[${jobId}] LLM tail: ${JSON.stringify(llmResultRaw.slice(-100))}`);
    const llmResult = sanitizeLlmOutput(llmResultRaw);
    if (llmResult.length !== llmResultRaw.length) {
      console.log(`[${jobId}] Sanitized: stripped ${llmResultRaw.length - llmResult.length} chars (BOM/whitespace/fences)`);
    }

    // 4. Validate output
    const outputEnabled = process.env.CRUD_OUTPUT_VALIDATION_ENABLED !== 'false';
    if (outputEnabled) {
      await sendProgress(jobId, 'processing', 'Валидация выходного DSL');
      const { validateOutputAgainstInput } = await import('./validator/index.ts');
      const out = validateOutputAgainstInput(sourceContent, llmResult);
      if (!out.ok) {
        const payload = JSON.stringify({
          stage: out.parseErrors.length > 0 ? 'output-parse' : 'output-validation',
          errors: out.parseErrors.length > 0 ? out.parseErrors : out.issues,
        });
        await sendProgress(jobId, 'failed', payload);
        return;
      }
    }

    // 5. Write result
    const outputPath = deriveOutputPath(path);
    await sendProgress(jobId, 'processing', `Запись результата в ${outputPath}`);
    await writeResultFile(outputPath, llmResult);

    await sendProgress(jobId, 'completed', 'Готово');
    console.log(`[${jobId}] Job completed`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[${jobId}] Failed: ${message}`);
    await sendProgress(jobId, 'failed', message);
  }
}

app.post('/start', (req, res) => {
  const { jobId, path } = req.body as StartRequest;
  console.log(`\nReceived job: ${jobId}, path: ${path}`);

  processJob(jobId, path).catch((err) => {
    console.error(`[${jobId}] Unhandled error:`, err);
  });

  res.status(202).json({ received: true });
});

const port = config.PORT ?? 3003;
app.listen(port, () => {
  console.log(`CRUD API Exporter listening on port ${port}`);
});
