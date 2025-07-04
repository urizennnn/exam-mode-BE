import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  PDF_QUEUE,
  PdfJobs,
  MarkJobData,
  ParseJobData,
  EXAM_SCHEDULER_QUEUE,
} from 'src/utils/constants';
import {
  Exam,
  ExamAccessType,
  ExamDocument,
} from 'src/modules/exam/models/exam.model';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProcessService } from 'src/modules/process/process.service';
import { DocentiLogger } from 'src/lib/logger';

@Processor(PDF_QUEUE)
@Injectable()
export class PdfQueueConsumer extends WorkerHost {
  constructor(
    private readonly processSvc: ProcessService,
    private readonly log: DocentiLogger,
  ) {
    super();
  }
  async process(job: Job): Promise<unknown> {
    try {
      switch (job.name as PdfJobs) {
        case PdfJobs.PROCESS:
          this.log.debug(`Parsing PDF for job ${job.id}`);
          return this.processSvc.parsePdfWorker(job as Job<ParseJobData>);

        case PdfJobs.MARK:
          this.log.debug(`Marking PDF for job ${job.id}`);
          return this.processSvc.markPdfWorker(job.data as MarkJobData);

        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (err) {
      this.log.error('Queue consumer process error', err);
      throw err;
    }
  }
}
@Processor(EXAM_SCHEDULER_QUEUE)
export class ExamSchedulerProcessor {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    private readonly log: DocentiLogger,
  ) {}

  async handleOpenExam(job: Job<{ examId: string }>) {
    try {
      await this.examModel.updateOne(
        { _id: job.data.examId, access: ExamAccessType.SCHEDULED },
        { $set: { access: ExamAccessType.OPEN } },
      );
    } catch (err) {
      this.log.error('Failed to open scheduled exam', err);
      throw err;
    }
  }
}
