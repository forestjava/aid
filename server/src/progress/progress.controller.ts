import {
  Controller,
  Post,
  Param,
  Body,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { SseService } from '../sse/sse.service';
import { ProgressEventDto } from '../types/runner';

@Controller('jobs')
export class ProgressController {
  private readonly logger = new Logger(ProgressController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly sseService: SseService,
  ) {}

  @Post(':jobId/progress')
  receiveProgress(
    @Param('jobId') jobId: string,
    @Body() event: ProgressEventDto,
  ) {
    const job = this.jobsService.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`);
    }

    event.jobId = jobId;

    const updated = this.jobsService.updateStatus(jobId, event);
    if (!updated) {
      this.logger.debug(`Duplicate event skipped for job=${jobId} status=${event.status}`);
      return { received: true };
    }

    this.logger.log(`Progress: job=${jobId} status=${event.status} message=${event.message}`);
    this.sseService.sendToJob(jobId, event);

    if (event.status === 'completed' || event.status === 'failed') {
      this.sseService.closeStream(jobId);
    }

    return { received: true };
  }
}
