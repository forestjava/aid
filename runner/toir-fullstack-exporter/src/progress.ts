import { config } from './config.js';

const PROGRESS_TIMEOUT_MS = 5000;

export async function sendProgress(
  jobId: string,
  status: 'started' | 'processing' | 'completed' | 'failed',
  message: string,
): Promise<void> {
  try {
    const url = `${config.CALLBACK_BASE_URL}/api/jobs/${jobId}/progress`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, status, message }),
      signal: AbortSignal.timeout(PROGRESS_TIMEOUT_MS),
    });
    console.log(`  -> ${status}: ${message} => ${response.status}`);
  } catch (err) {
    console.error(`  -> Failed to send progress: ${(err as Error).message}`);
  }
}
