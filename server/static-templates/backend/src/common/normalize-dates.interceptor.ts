import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

const normalize = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (DATE_ONLY.test(value)) return `${value}T00:00:00.000Z`;
    if (DATETIME_NO_TZ.test(value)) return `${value}Z`;
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
};

@Injectable()
export class NormalizeDatesInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ body?: unknown }>();
    if (req.body && typeof req.body === 'object') {
      req.body = normalize(req.body);
    }
    return next.handle();
  }
}
