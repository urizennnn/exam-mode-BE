import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PDF_QUEUE,
  PdfJobs,
  MarkJobData,
  ParseJobData,
} from 'src/utils/constants';
import { randomUUID } from 'node:crypto';

const ONE_HOUR = 60 * 60;

@Injectable()
export class PdfQueueProducer {
  constructor(@InjectQueue(PDF_QUEUE) private readonly queue: Queue) {}

  enqueueProcess(data: ParseJobData) {
    return this.queue.add(PdfJobs.PROCESS, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      jobId: randomUUID(),
      removeOnComplete: { age: ONE_HOUR },
      removeOnFail: true,
    });
  }

  enqueueMark(data: MarkJobData) {
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
