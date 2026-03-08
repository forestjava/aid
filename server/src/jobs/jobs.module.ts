import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SseModule } from '../sse/sse.module';
import { ExportersModule } from '../exporters/exporters.module';

@Module({
  imports: [SseModule, ExportersModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
