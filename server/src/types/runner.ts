export type JobStatus = 'started' | 'processing' | 'completed' | 'failed';

export interface ProgressEvent {
  jobId: string;
  status: JobStatus;
  message: string;
}

export interface JobRecord {
  jobId: string;
  exporterId: string;
  status: JobStatus | 'queued';
  lastMessage: string | null;
  createdAt: string;
  events: ProgressEvent[];
}

export interface ExporterConfig {
  exporterId: string;
  name: string;
  baseUrl: string;
  startPath: string;
}

export class StartJobDto {
  exporterId: string;
  path: string;
}

export class ProgressEventDto {
  jobId: string;
  status: JobStatus;
  message: string;
}
