import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PDF_QUEUE, PdfJobs } from 'src/utils/constants';

interface ParsePayload {
  tmpPath: string;
}

interface MarkPayload extends ParsePayload {
  examKey: string;
  email: string;
  studentAnswer: string;
}

interface ProcessPayload {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class PdfQueueProducer {
  constructor(@InjectQueue(PDF_QUEUE) private readonly queue: Queue) {}

  async enqueueParse(tmpPath: string) {
    return this.queue.add(PdfJobs.PARSE, { tmpPath });
  }

  async enqueueMark(data: MarkPayload) {
    return this.queue.add(PdfJobs.MARK, data);
  }

  async enqueueProcessPdf(data: ProcessPayload) {
    return this.queue.add(PdfJobs.PROCESS, data);
  }
}
