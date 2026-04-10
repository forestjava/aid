import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject, Observable, concat, from } from 'rxjs';
import type { ProgressEvent } from '../types/runner';

interface JobStream {
  subject: Subject<MessageEvent>;
  buffer: MessageEvent[];
  subscribed: boolean;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly streams = new Map<string, JobStream>();

  private ensureStream(jobId: string): JobStream {
    let stream = this.streams.get(jobId);
    if (!stream) {
      stream = { subject: new Subject(), buffer: [], subscribed: false };
      this.streams.set(jobId, stream);
    }
    return stream;
  }

  getOrCreate(jobId: string): Observable<MessageEvent> {
    const stream = this.ensureStream(jobId);
    stream.subscribed = true;

    if (stream.buffer.length > 0) {
      const buffered = [...stream.buffer];
      stream.buffer = [];
      return concat(from(buffered), stream.subject.asObservable());
    }

    return stream.subject.asObservable();
  }

  sendToJob(jobId: string, event: ProgressEvent): void {
    const stream = this.ensureStream(jobId);
    const msg = { data: event.message, type: event.status } as MessageEvent;

    if (stream.subscribed) {
      stream.subject.next(msg);
    } else {
      stream.buffer.push(msg);
    }
  }

  closeStream(jobId: string): void {
    const stream = this.streams.get(jobId);
    if (stream) {
      stream.subject.complete();
      this.streams.delete(jobId);
      this.logger.log(`SSE stream closed for jobId=${jobId}`);
    }
  }
}
