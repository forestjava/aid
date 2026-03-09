import { config } from './config.js';

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
    });
    console.log(`  -> ${status}: ${message} => ${response.status}`);
  } catch (err) {
    console.error(`  -> Failed to send progress: ${(err as Error).message}`);
  }
}
