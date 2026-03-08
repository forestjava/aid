import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { ProgressEvent } from '../types/runner';

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  getOrCreate(jobId: string): Observable<MessageEvent> {
    let subject = this.streams.get(jobId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.streams.set(jobId, subject);
    }
    return subject.asObservable();
  }

  sendToJob(jobId: string, event: ProgressEvent): void {
    const subject = this.streams.get(jobId);
    if (!subject) {
      this.logger.warn(`No SSE stream for jobId=${jobId}`);
      return;
    }
    subject.next({ data: event.message, type: event.status } as MessageEvent);
  }

  closeStream(jobId: string): void {
    const subject = this.streams.get(jobId);
    if (subject) {
      subject.complete();
      this.streams.delete(jobId);
      this.logger.log(`SSE stream closed for jobId=${jobId}`);
    }
  }
}
