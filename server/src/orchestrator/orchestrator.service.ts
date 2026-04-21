import { Injectable, Logger } from '@nestjs/common';
import { TemplateService } from './template.service';
import { GiteaClient } from './gitea.client';
import { JobsService } from '../jobs/jobs.service';
import { ExportersService } from '../exporters/exporters.service';
import { SseService } from '../sse/sse.service';
import { GenerateDto } from './dto/generate.dto';
import { ConfigService } from '@nestjs/config';
import { PortainerClient } from './portainer.client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileP = promisify(execFile);

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
  private readonly workspaceRoot = '/workspace';
  private readonly giteaUser: string;
  private readonly giteaToken: string;

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
    this.giteaUser = configService.get('GITEA_USER', 'aid');
    this.giteaToken = configService.get('GITEA_TOKEN', '');
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

      this.updateProgress(jobId, 'processing', 'Cloning workspace...');
      const cloneUrl = new URL(repo.clone_url);
      cloneUrl.username = this.giteaUser;
      cloneUrl.password = this.giteaToken;
      const workspacePath = await this.prepareWorkspace(dto.projectName, cloneUrl.toString());

      // Phase 1: Prisma Schema (sequential)
      this.updateProgress(jobId, 'processing', 'Phase 1: Generating Prisma schema...');
      const prismaConfig = this.exportersService.findById('prisma-schema');
      if (!prismaConfig) throw new Error('runner-prisma not registered');

      const prismaJob = this.jobsService.create('prisma-schema');
      await this.exportersService.startJob(prismaConfig, {
        jobId: prismaJob.jobId,
        path: dto.dslPath,
        workspacePath,
        projectName: dto.projectName,
      });
      const prismaResult = await this.waitForJob(prismaJob.jobId, 120000);
      void prismaResult;
      this.updateProgress(jobId, 'processing', 'Phase 1 complete. Schema written to workspace.');

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
          workspacePath,
          projectName: dto.projectName,
        });
        phase2Jobs.push({ name: 'Backend', jobId: job.jobId });
      }

      if (reactAdminConfig) {
        const job = this.jobsService.create('react-admin-frontend');
        await this.exportersService.startJob(reactAdminConfig, {
          jobId: job.jobId,
          path: dto.dslPath,
          workspacePath,
          projectName: dto.projectName,
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

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          succeeded.push(r.value.name);
        } else {
          failed.push(phase2Jobs[i]?.name ?? 'unknown');
        }
      }

      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`Phase 2 failed: ${failed.join(', ')}`);
      }

      this.updateProgress(jobId, 'processing', 'Committing and pushing generated code...');
      await this.finalizeWorkspace(workspacePath, 'feat: add generated code');

      if (failed.length > 0) {
        this.updateProgress(jobId, 'completed',
          `Partial generation. Success: ${succeeded.join(', ')}. Failed: ${failed.join(', ')}. Repo: ${repo.html_url}`);
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

  private async finalizeWorkspace(workspacePath: string, commitMessage: string): Promise<boolean> {
    const { stdout } = await execFileP('git', ['-C', workspacePath, 'status', '--porcelain']);
    if (stdout.trim().length === 0) {
      this.logger.warn(`No changes in ${workspacePath} to commit`);
      return false;
    }

    await execFileP('git', ['-C', workspacePath, 'add', '.']);
    await execFileP('git', ['-C', workspacePath, 'commit', '-m', commitMessage]);
    await execFileP('git', ['-C', workspacePath, 'push']);
    return true;
  }

  private async prepareWorkspace(projectName: string, repoCloneUrl: string): Promise<string> {
    const targetDir = path.join(this.workspaceRoot, projectName);

    // Wipe if exists (re-run case)
    await execFileP('rm', ['-rf', targetDir]);
    await execFileP('mkdir', ['-p', this.workspaceRoot]);
    await execFileP('git', ['clone', repoCloneUrl, targetDir]);

    // configure git identity so commits succeed later
    await execFileP('git', ['-C', targetDir, 'config', 'user.email', 'aid@greact.ru']);
    await execFileP('git', ['-C', targetDir, 'config', 'user.name', 'aid-orchestrator']);

    return targetDir;
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
