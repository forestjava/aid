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
      baseUrl: process.env.EXPORTER_DEMO_URL ?? 'http://aid-runner-demo:3003',
      startPath: '/start',
    });
    this.register({
      exporterId: 'crud-api',
      name: 'CRUD API Exporter',
      baseUrl:
        process.env.EXPORTER_CRUD_API_URL ??
        'http://aid-runner-crud-api-exporter:3003',
      startPath: '/start',
    });
    this.register({
      exporterId: 'contract',
      name: 'Contract Craft Exporter',
      baseUrl:
        process.env.EXPORTER_CONTRACT_URL ??
        'http://contract-craft-dev-service:8080',
      startPath: '/api/trigger',
    });
  }

  register(config: ExporterConfig): void {
    this.registry.set(config.exporterId, config);
    this.logger.log(
      `Registered exporter: ${config.exporterId} (${config.name}) at ${config.baseUrl}`,
    );
  }

  findById(exporterId: string): ExporterConfig | undefined {
    return this.registry.get(exporterId);
  }

  async startJob(
    config: ExporterConfig,
    payload: { jobId: string; path: string },
  ): Promise<void> {
    const url = `${config.baseUrl}${config.startPath}`;
    this.logger.log(
      `Starting job=${payload.jobId} on exporter=${config.exporterId} at ${url}`,
    );

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
