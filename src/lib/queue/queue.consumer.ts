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
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name as PdfJobs) {
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
      case PdfJobs.PROCESS:
        await this.handleProcess(job as Job<Express.Multer.File>);
        break;

      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleProcess(job: Job<Express.Multer.File>) {
    const data = job.data;
    await this.processSvc.processPdf(data);
  }

  private async handleParse(job: Job<{ tmpPath: string }>) {
    const buffer = await fs.readFile(job.data.tmpPath);
    await this.processSvc.processPdf({
      buffer,
      mimetype: 'application/pdf',
    } as Express.Multer.File);
    await fs.unlink(job.data.tmpPath);
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
