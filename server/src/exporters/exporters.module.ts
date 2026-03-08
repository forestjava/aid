import { Module } from '@nestjs/common';
import { ExportersService } from './exporters.service';

@Module({
  providers: [ExportersService],
  exports: [ExportersService],
})
export class ExportersModule {}
