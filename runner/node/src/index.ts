import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL ?? 'http://localhost:3000';

interface StartRequest {
  jobId: string;
  path: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendProgress(jobId: string, status: string, message: string): Promise<void> {
  try {
    const url = `${CALLBACK_BASE_URL}/api/jobs/${jobId}/progress`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, status, message }),
    });
    console.log(`  -> ${status}: ${message} => ${response.status}`);
  } catch (err) {
    console.error(`  -> Failed to send progress: ${(err as Error).message}`);
  }
}

async function processJob(jobId: string, path: string): Promise<void> {
  console.log(`[${jobId}] Path: ${path}`);

  try {
    await sendProgress(jobId, 'started', 'Инициализация');
    await delay(1000);

    await sendProgress(jobId, 'processing', 'Получение данных');

    const url = `${CALLBACK_BASE_URL}/api/parse/text?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json() as { path: string; content: string };
    const lineCount = data.content.split('\n').length;
    console.log(`[${jobId}] Fetched ${lineCount} lines from ${path}`);
    await sendProgress(jobId, 'processing', `Fetched ${lineCount} lines from ${path}`);

    await sendProgress(jobId, 'processing', 'Обработка данных');
    await delay(10_000);

    await sendProgress(jobId, 'processing', 'Финализация');
    await delay(1000);

    await sendProgress(jobId, 'completed', `Готово: ${lineCount} строк`);
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

app.listen(PORT, () => {
  console.log(`Demo Exporter listening on port ${PORT}`);
});
