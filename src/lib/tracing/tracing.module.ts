import { Global, Module } from '@nestjs/common';
import tracer from './tracing';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [TracingService, { provide: 'DATADOG_TRACER', useValue: tracer }],
  exports: [TracingService, 'DATADOG_TRACER'],
})
export class TracingModule {}
