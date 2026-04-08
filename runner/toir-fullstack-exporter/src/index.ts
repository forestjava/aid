import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { runJob } from './orchestrator.js';

const app = express();
app.use(express.json());

interface StartRequest {
  jobId: string;
  path: string;
}

app.post('/start', (req, res) => {
  const { jobId, path } = req.body as StartRequest;
  console.log(`\nReceived job: ${jobId}, path: ${path}`);

  runJob(jobId, path).catch((err) => {
    console.error(`[${jobId}] Unhandled error:`, err);
  });

  res.status(202).json({ received: true });
});

const port = Number(config.PORT);
app.listen(port, () => {
  console.log(`Exporter on port ${port}`);
});
