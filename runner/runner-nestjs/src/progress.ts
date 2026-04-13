import { config } from './config.js';

export async function sendProgress(
  jobId: string,
  status: 'started' | 'processing' | 'completed' | 'failed',
  message: string,
): Promise<void> {
  try {
    await fetch(`${config.CALLBACK_BASE_URL}/api/jobs/${jobId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, status, message }),
    });
  } catch (err) {
    console.error(`Failed to send progress for ${jobId}:`, err);
  }
}
