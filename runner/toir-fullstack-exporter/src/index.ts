import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';

const app = express();
app.use(express.json());

interface StartRequest {
  jobId: string;
  path: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(jobId: string, path: string): Promise<void> {
  console.log(`[${jobId}] Path: ${path}`);

  try {
    await sendProgress(jobId, 'started', 'Задача принята');

    await sleep(1000);
    await sendProgress(jobId, 'processing', 'Stub stage 1/3');

    await sleep(1000);
    await sendProgress(jobId, 'processing', 'Stub stage 2/3');

    await sleep(1000);
    await sendProgress(jobId, 'processing', 'Stub stage 3/3');

    await sendProgress(jobId, 'completed', 'Phase 1 stub: dry-run successful');
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

const port = Number(config.PORT);
app.listen(port, () => {
  console.log(`Exporter on port ${port}`);
});
