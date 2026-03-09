import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceContent } from './fetchSource.js';
import { generateWithLLM } from './llmClient.js';
import { writeResultFile } from './writeResult.js';

const app = express();
app.use(express.json());

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

    // 1. Fetch source DSL content
    await sendProgress(jobId, 'processing', 'Получение исходного текста');
    const sourceContent = await fetchSourceContent(path);
    const lineCount = sourceContent.split('\n').length;
    console.log(`[${jobId}] Fetched ${lineCount} lines from ${path}`);
    await sendProgress(jobId, 'processing', `Исходный текст получен (${lineCount} строк)`);

    // 2. Send to LLM
    await sendProgress(jobId, 'processing', 'Обращение к LLM');
    const llmResult = await generateWithLLM(sourceContent);
    console.log(`[${jobId}] LLM response: ${llmResult.length} characters`);
    await sendProgress(jobId, 'processing', `LLM ответ получен (${llmResult.length} символов)`);

    // 3. Write result file
    const outputPath = deriveOutputPath(path);
    await sendProgress(jobId, 'processing', `Запись результата в ${outputPath}`);
    await writeResultFile(outputPath, llmResult);
    console.log(`[${jobId}] Result written to ${outputPath}`);
    await sendProgress(jobId, 'processing', `Результат записан в файл ${outputPath}`);

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
