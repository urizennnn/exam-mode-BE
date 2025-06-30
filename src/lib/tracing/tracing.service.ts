import { Injectable } from '@nestjs/common';
import type { Span } from 'dd-trace';
import tracer from './tracing';

@Injectable()
export class TracingService {
  captureException(error: unknown, span?: Span): void {
    const active = span || tracer.scope().active();
    if (!active) return;
    active.setTag('error', true);
    if (error instanceof Error) {
      active.setTag('error.message', error.message);
      active.setTag('error.stack', error.stack || '');
      active.setTag('error.type', error.name);
    } else {
      active.setTag('error.message', String(error));
    }
  }
}
