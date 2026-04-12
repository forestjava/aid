import { Injectable, Logger } from '@nestjs/common';
import { TemplateService } from './template.service';
import { GiteaClient } from './gitea.client';
import { JobsService } from '../jobs/jobs.service';
import { ExportersService } from '../exporters/exporters.service';
import { SseService } from '../sse/sse.service';
import { GenerateDto } from './dto/generate.dto';
import { ConfigService } from '@nestjs/config';

export interface GenerationResult {
  jobId: string;
  repoUrl: string;
  sseUrl: string;
  status: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly giteaClient: GiteaClient;

  constructor(
    private readonly templateService: TemplateService,
    private readonly jobsService: JobsService,
    private readonly exportersService: ExportersService,
    private readonly sseService: SseService,
    configService: ConfigService,
  ) {
    this.giteaClient = new GiteaClient(
      configService.get('GITEA_URL', 'http://gitea:3000'),
      configService.get('GITEA_TOKEN', ''),
      configService.get('GITEA_ORG', 'greact'),
    );
  }

  async startGeneration(dto: GenerateDto): Promise<GenerationResult> {
    const job = this.jobsService.create('orchestrator');
    const { jobId } = job;

    this.runPipeline(jobId, dto).catch((err) => {
      this.logger.error(`Pipeline failed: ${err.message}`);
    });

    return {
      jobId,
      repoUrl: '',
      sseUrl: `/api/jobs/${jobId}/sse`,
      status: 'queued',
    };
  }

  private async runPipeline(jobId: string, dto: GenerateDto): Promise<void> {
    try {
      this.updateProgress(jobId, 'started', 'Step 0: Preparing project...');

      const exists = await this.giteaClient.repoExists(dto.projectName);
      if (exists) {
        this.updateProgress(jobId, 'processing', 'Cleaning up previous generation...');
        await this.giteaClient.deleteRepo(dto.projectName);
      }

      this.updateProgress(jobId, 'processing', 'Creating Gitea repository...');
      const repo = await this.giteaClient.createRepo(dto.projectName);

      this.updateProgress(jobId, 'processing', 'Rendering project templates...');
      const files = await this.templateService.renderTemplates({
        projectName: dto.projectName,
        domain: dto.domain,
      });

      this.updateProgress(jobId, 'processing', `Pushing ${files.size} template files to Gitea...`);
      await this.giteaClient.pushFiles(dto.projectName, files, 'chore: initial project scaffold');

      this.updateProgress(jobId, 'processing', 'Phase 1: Generating Prisma schema...');
      const prismaConfig = this.exportersService.findById('prisma-schema');

      if (!prismaConfig) {
        throw new Error('runner-prisma not registered in exporters');
      }

      const prismaJob = this.jobsService.create('prisma-schema');
      await this.exportersService.startJob(prismaConfig, {
        jobId: prismaJob.jobId,
        path: dto.dslPath,
      });

      await this.waitForJob(prismaJob.jobId, 120000);

      this.updateProgress(jobId, 'processing', 'Phase 1 complete. Schema validated.');

      this.updateProgress(jobId, 'completed', `Generation complete. Repo: ${repo.html_url}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateProgress(jobId, 'failed', `Pipeline failed: ${message}`);
    }
  }

  private async waitForJob(jobId: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    const pollInterval = 2000;

    while (Date.now() - start < timeoutMs) {
      const job = this.jobsService.findById(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);

      if (job.status === 'completed') return;
      if (job.status === 'failed') {
        throw new Error(`Sub-job ${jobId} failed: ${job.lastMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Sub-job ${jobId} timed out after ${timeoutMs}ms`);
  }

  private updateProgress(jobId: string, status: string, message: string): void {
    this.jobsService.updateStatus(jobId, {
      jobId,
      status: status as any,
      message,
    });
    this.sseService.sendToJob(jobId, {
      jobId,
      status: status as any,
      message,
    });

    if (status === 'completed' || status === 'failed') {
      this.sseService.closeStream(jobId);
    }
  }
}
