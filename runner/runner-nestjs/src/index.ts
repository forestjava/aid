import express from 'express';
import { config } from './config.js';
import { sendProgress } from './progress.js';
import { fetchSourceText } from './fetchSource.js';
import { generateNestJsBackendAgentic } from './llmClient.js';

interface StartRequest {
  jobId: string;
  path: string;
  workspacePath: string;
  projectName: string;
}

async function processJob(jobId: string, sourcePath: string, workspacePath: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Starting NestJS backend generation (agentic mode)...');
    await sendProgress(jobId, 'processing', 'Fetching DSL source...');
    const dslContent = await fetchSourceText(sourcePath);

    await sendProgress(jobId, 'processing', 'Running agentic loop...');
    await generateNestJsBackendAgentic(dslContent, workspacePath, (m) => {
      sendProgress(jobId, 'processing', m);
    });

    await sendProgress(jobId, 'completed', 'Backend generated.');
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
  res.json({ status: 'ok', runner: 'nestjs' });
});

app.listen(Number(config.PORT), () => {
  console.log(`runner-nestjs listening on port ${config.PORT}`);
});
