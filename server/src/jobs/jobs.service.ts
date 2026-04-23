import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobRecord, ProgressEvent } from '../types/runner';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobs = new Map<string, JobRecord>();
  private readonly parentByChild = new Map<string, string>();

  create(exporterId: string): JobRecord {
    const jobId = randomUUID();
    const job: JobRecord = {
      jobId,
      exporterId,
      status: 'queued',
      lastMessage: null,
      createdAt: new Date().toISOString(),
      events: [],
    };
    this.jobs.set(jobId, job);
    this.logger.log(`Job created: ${jobId} for exporter=${exporterId}`);
    return job;
  }

  linkChildToParent(childJobId: string, parentJobId: string): void {
    this.parentByChild.set(childJobId, parentJobId);
  }

  getParent(childJobId: string): string | undefined {
    return this.parentByChild.get(childJobId);
  }

  findById(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  updateStatus(jobId: string, event: ProgressEvent): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const last = job.events[job.events.length - 1];
    if (last && last.status === event.status && last.message === event.message) {
      return false;
    }

    job.status = event.status;
    job.lastMessage = event.message;
    job.events.push(event);
    return true;
  }

  isTerminal(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return job?.status === 'completed' || job?.status === 'failed';
  }
}
