import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Sse,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import { Observable, of, EMPTY } from 'rxjs';
import { JobsService } from './jobs.service';
import { SseService } from '../sse/sse.service';
import { ExportersService } from '../exporters/exporters.service';
import { StartJobDto } from '../types/runner';

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly sseService: SseService,
    private readonly exportersService: ExportersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() dto: StartJobDto) {
    const config = this.exportersService.findById(dto.exporterId);
    if (!config) {
      throw new NotFoundException(`Exporter "${dto.exporterId}" not found`);
    }

    const job = this.jobsService.create(dto.exporterId);

    this.exportersService
      .startJob(config, { jobId: job.jobId, path: dto.path })
      .catch((err) => {
        this.logger.error(`Failed to start exporter for job=${job.jobId}: ${err.message}`);
        const failedEvent = {
          jobId: job.jobId,
          status: 'failed' as const,
          message: `Exporter start failed: ${err.message}`,
        };
        this.jobsService.updateStatus(job.jobId, failedEvent);
        this.sseService.sendToJob(job.jobId, failedEvent);
        this.sseService.closeStream(job.jobId);
      });

    return {
      jobId: job.jobId,
      status: 'queued',
      sseUrl: `/api/jobs/${job.jobId}/sse`,
    };
  }

  @Get(':jobId')
  getStatus(@Param('jobId') jobId: string) {
    const job = this.jobsService.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`);
    }
    return {
      jobId: job.jobId,
      status: job.status,
      message: job.lastMessage,
    };
  }

  @Sse(':jobId/sse')
  sse(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const job = this.jobsService.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`);
    }

    if (this.jobsService.isTerminal(jobId)) {
      return job.lastMessage
        ? of({ data: job.lastMessage, type: job.status } as MessageEvent)
        : EMPTY;
    }

    return this.sseService.getOrCreate(jobId);
  }
}
