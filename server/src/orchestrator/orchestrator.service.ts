import { Injectable, Logger } from '@nestjs/common';
import { TemplateService } from './template.service';
import { GiteaClient } from './gitea.client';
import { JobsService } from '../jobs/jobs.service';
import { ExportersService } from '../exporters/exporters.service';
import { SseService } from '../sse/sse.service';
import { GenerateDto } from './dto/generate.dto';
import { ConfigService } from '@nestjs/config';
import { PortainerClient } from './portainer.client';

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
  private readonly portainerClient: PortainerClient;

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
    this.portainerClient = new PortainerClient(
      configService.get('PORTAINER_URL', 'http://portainer:9000'),
      configService.get('PORTAINER_API_KEY', ''),
      Number(configService.get('PORTAINER_ENDPOINT_ID', '1')),
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
      // Step 0: Preparation
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

      // Phase 1: Prisma Schema (sequential)
      this.updateProgress(jobId, 'processing', 'Phase 1: Generating Prisma schema...');
      const prismaConfig = this.exportersService.findById('prisma-schema');
      if (!prismaConfig) throw new Error('runner-prisma not registered');

      const prismaJob = this.jobsService.create('prisma-schema');
      await this.exportersService.startJob(prismaConfig, {
        jobId: prismaJob.jobId,
        path: dto.dslPath,
      });
      const prismaResult = await this.waitForJob(prismaJob.jobId, 120000);

      // Push Phase 1 files to Gitea
      const prismaFiles = this.extractFilesFromResult(prismaResult);
      if (prismaFiles.size > 0) {
        this.updateProgress(jobId, 'processing', `Pushing ${prismaFiles.size} Phase 1 files to Gitea...`);
        await this.giteaClient.pushFiles(dto.projectName, prismaFiles, 'feat: add Prisma schema');
      }
      this.updateProgress(jobId, 'processing', 'Phase 1 complete. Schema validated.');

      // Phase 2: Backend + Frontend (parallel)
      this.updateProgress(jobId, 'processing', 'Phase 2: Generating backend and frontend in parallel...');

      const nestjsConfig = this.exportersService.findById('nestjs-backend');
      const reactAdminConfig = this.exportersService.findById('react-admin-frontend');

      const phase2Jobs: Array<{ name: string; jobId: string }> = [];

      if (nestjsConfig) {
        const job = this.jobsService.create('nestjs-backend');
        await this.exportersService.startJob(nestjsConfig, {
          jobId: job.jobId,
          path: dto.dslPath,
        });
        phase2Jobs.push({ name: 'Backend', jobId: job.jobId });
      }

      if (reactAdminConfig) {
        const job = this.jobsService.create('react-admin-frontend');
        await this.exportersService.startJob(reactAdminConfig, {
          jobId: job.jobId,
          path: dto.dslPath,
        });
        phase2Jobs.push({ name: 'Frontend', jobId: job.jobId });
      }

      // Wait for all Phase 2 jobs in parallel
      const results = await Promise.allSettled(
        phase2Jobs.map(async (j) => {
          const result = await this.waitForJob(j.jobId, 180000);
          return { name: j.name, result };
        }),
      );

      const succeeded: string[] = [];
      const failed: string[] = [];
      const allGeneratedFiles = new Map<string, string>();

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          succeeded.push(r.value.name);
          const generatedFiles = this.extractFilesFromResult(r.value.result);
          for (const [path, content] of generatedFiles) {
            allGeneratedFiles.set(path, content);
          }
        } else {
          failed.push(phase2Jobs[i]?.name ?? 'unknown');
        }
      }

      // Push Phase 2 files to Gitea
      if (allGeneratedFiles.size > 0) {
        this.updateProgress(jobId, 'processing', `Pushing ${allGeneratedFiles.size} generated files to Gitea...`);
        await this.giteaClient.pushFiles(dto.projectName, allGeneratedFiles, 'feat: add generated code');
      }

      if (failed.length > 0 && succeeded.length > 0) {
        this.updateProgress(jobId, 'completed',
          `Partial generation. Success: ${succeeded.join(', ')}. Failed: ${failed.join(', ')}. Repo: ${repo.html_url}`);
      } else if (failed.length > 0) {
        throw new Error(`Phase 2 failed: ${failed.join(', ')}`);
      } else {
        // Step 3: Deploy via Portainer
        try {
          this.updateProgress(jobId, 'processing', 'Step 3: Deploying via Portainer...');
          const existingStack = await this.portainerClient.getStackByName(dto.projectName);
          if (existingStack) {
            this.updateProgress(jobId, 'processing', 'Removing previous deployment...');
            await this.portainerClient.removeStack(existingStack.Id);
          }
          const composeContent = files.get('docker-compose.yml');
          if (composeContent) {
            this.updateProgress(jobId, 'processing', 'Creating Portainer stack...');
            await this.portainerClient.deployStack(dto.projectName, composeContent);
            this.updateProgress(jobId, 'processing', 'Stack deployed successfully.');
          }
        } catch (deployErr) {
          const deployMsg = deployErr instanceof Error ? deployErr.message : String(deployErr);
          this.logger.warn(`Portainer deploy failed: ${deployMsg}`);
          this.updateProgress(jobId, 'processing', `Deploy warning: ${deployMsg}. Code is in Gitea.`);
        }
        this.updateProgress(jobId, 'completed',
          `Generation complete. Backend + Frontend generated. Repo: ${repo.html_url}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateProgress(jobId, 'failed', `Pipeline failed: ${message}`);
    }
  }

  private async waitForJob(jobId: string, timeoutMs: number): Promise<string> {
    const start = Date.now();
    const pollInterval = 2000;

    while (Date.now() - start < timeoutMs) {
      const job = this.jobsService.findById(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);

      if (job.status === 'completed') return job.lastMessage ?? '';
      if (job.status === 'failed') {
        throw new Error(`Sub-job ${jobId} failed: ${job.lastMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Sub-job ${jobId} timed out after ${timeoutMs}ms`);
  }

  private extractFilesFromResult(resultMessage: string): Map<string, string> {
    const files = new Map<string, string>();
    try {
      const parsed = JSON.parse(resultMessage);
      if (parsed.files && typeof parsed.files === 'object') {
        for (const [path, content] of Object.entries(parsed.files)) {
          if (typeof content === 'string') {
            files.set(path, content);
          }
        }
      }
    } catch {
      // Not JSON — old format, no files to extract
    }
    return files;
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
