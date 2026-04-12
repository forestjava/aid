import { Module } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { TemplateService } from './template.service';
import { JobsModule } from '../jobs/jobs.module';
import { ExportersModule } from '../exporters/exporters.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [JobsModule, ExportersModule, SseModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorService, TemplateService],
})
export class OrchestratorModule {}
