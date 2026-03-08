import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { JobsModule } from '../jobs/jobs.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [JobsModule, SseModule],
  controllers: [ProgressController],
})
export class ProgressModule {}
