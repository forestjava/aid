import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Для всех неперехваченных исключений
    const error = exception as Error;

    this.logger.error(
      `[${request.method}] ${request.url} - ${error.message}`,
      error.stack,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: error.message,
    });
  }
}
