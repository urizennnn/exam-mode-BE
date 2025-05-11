import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'node:fs/promises';

import { PDF_QUEUE, PdfJobs } from 'src/utils/constants';
import { ProcessService } from 'src/modules/process/process.service';

@Processor(PDF_QUEUE)
@Injectable()
export class PdfQueueConsumer extends WorkerHost {
  constructor(private readonly processSvc: ProcessService) {
    super(); // WorkerHost ctor
  }

  /** single entry-point called automatically for every job */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PdfJobs.PARSE:
        await this.handleParse(job as Job<{ tmpPath: string }>);
        break;

      case PdfJobs.MARK:
        await this.handleMark(
          job as Job<{
            tmpPath: string;
            examKey: string;
            email: string;
            studentAnswer: string;
          }>,
        );
        break;

      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  /* ---------- helpers ---------- */

  private async handleParse(job: Job<{ tmpPath: string }>) {
    const buffer = await fs.readFile(job.data.tmpPath);
    await this.processSvc.processPdf({
      buffer,
      mimetype: 'application/pdf',
    } as Express.Multer.File);
    await fs.unlink(job.data.tmpPath); // tidy up tmp file
  }

  private async handleMark(
    job: Job<{
      tmpPath: string;
      examKey: string;
      email: string;
      studentAnswer: string;
    }>,
  ) {
    const { tmpPath, examKey, email, studentAnswer } = job.data;
    const buffer = await fs.readFile(tmpPath);

    await this.processSvc.markPdf(
      { buffer, mimetype: 'application/pdf' } as Express.Multer.File,
      examKey,
      email,
      studentAnswer,
    );

    await fs.unlink(tmpPath);
  }
}
