import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

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

export interface RunnerStartPayload {
  jobId: string;
  path: string;
  workspacePath?: string;   // absolute path inside shared volume, e.g. /workspace/{projectName}
  projectName?: string;     // used for logging / progress messages
}

export class StartJobDto {
  @IsString()
  @IsNotEmpty()
  exporterId: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class ProgressEventDto {
  @IsString()
  @IsOptional()
  jobId: string;

  @IsIn(['started', 'processing', 'completed', 'failed'])
  status: JobStatus;

  @IsString()
  @IsNotEmpty()
  message: string;
}
