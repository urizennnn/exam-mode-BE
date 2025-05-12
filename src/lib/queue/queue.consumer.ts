import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  PDF_QUEUE,
  PdfJobs,
  MarkJobData,
  ParseJobData,
} from 'src/utils/constants';
import { ProcessService } from 'src/modules/process/process.service';

@Processor(PDF_QUEUE)
@Injectable()
export class PdfQueueConsumer extends WorkerHost {
  private readonly log = new Logger(PdfQueueConsumer.name);

  constructor(private readonly processSvc: ProcessService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name as PdfJobs) {
      case PdfJobs.PROCESS:
        this.log.debug(`Parsing PDF for job ${job.id}`);
        return this.processSvc.parsePdfWorker(job.data as ParseJobData);

      case PdfJobs.MARK:
        this.log.debug(`Marking PDF for job ${job.id}`);
        return this.processSvc.markPdfWorker(job.data as MarkJobData);

      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }
}
