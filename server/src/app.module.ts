import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileSystemModule } from './filesystem/filesystem.module';
import { ParseModule } from './parse/parse.module';
import { SseModule } from './sse/sse.module';
import { ExportersModule } from './exporters/exporters.module';
import { JobsModule } from './jobs/jobs.module';
import { ProgressModule } from './progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FileSystemModule,
    ParseModule,
    SseModule,
    ExportersModule,
    JobsModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
