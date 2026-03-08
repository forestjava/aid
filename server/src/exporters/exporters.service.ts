import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExporterConfig } from '../types/runner';

@Injectable()
export class ExportersService implements OnModuleInit {
  private readonly logger = new Logger(ExportersService.name);
  private readonly registry = new Map<string, ExporterConfig>();

  onModuleInit() {
    this.register({
      exporterId: 'demo',
      name: 'Demo Exporter',
      baseUrl: 'http://localhost:3001',
      startPath: '/start',
    });
  }

  register(config: ExporterConfig): void {
    this.registry.set(config.exporterId, config);
    this.logger.log(`Registered exporter: ${config.exporterId} (${config.name}) at ${config.baseUrl}`);
  }

  findById(exporterId: string): ExporterConfig | undefined {
    return this.registry.get(exporterId);
  }

  async startJob(
    config: ExporterConfig,
    payload: { jobId: string; path: string; callbackUrl: string },
  ): Promise<void> {
    const url = `${config.baseUrl}${config.startPath}`;
    this.logger.log(`Starting job=${payload.jobId} on exporter=${config.exporterId} at ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Exporter returned ${response.status}: ${text}`);
    }
  }
}
