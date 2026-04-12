import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrchestratorService, GenerationResult } from './orchestrator.service';
import { GenerateDto } from './dto/generate.dto';

@Controller('generate')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(@Body() dto: GenerateDto): Promise<GenerationResult> {
    return this.orchestratorService.startGeneration(dto);
  }
}
