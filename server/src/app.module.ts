import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileSystemModule } from './filesystem/filesystem.module';
import { ParseModule } from './parse/parse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FileSystemModule,
    ParseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
