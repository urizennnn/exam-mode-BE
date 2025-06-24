import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PDF_QUEUE,
  PdfJobs,
  MarkJobData,
  ParseJobData,
} from 'src/utils/constants';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PdfQueueProducer {
  private readonly log = new Logger(PdfQueueProducer.name);
  constructor(@InjectQueue(PDF_QUEUE) private readonly queue: Queue) {}

  enqueueProcess(data: ParseJobData) {
    this.log.verbose(`Queueing parse job for ${data.examKey || data.tmpPath}`);
    return this.queue.add(PdfJobs.PROCESS, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      jobId: randomUUID(),
      removeOnFail: true,
    });
  }

  enqueueMark(data: MarkJobData) {
    this.log.verbose(`Queueing mark job for ${data.examKey} – ${data.email}`);
    return this.queue.add(PdfJobs.MARK, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      jobId: randomUUID(),
      removeOnFail: true,
    });
  }
}
