import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  PDF_QUEUE,
  PdfJobs,
  MarkJobData,
  ParseJobData,
  EXAM_SCHEDULER_QUEUE,
} from 'src/utils/constants';
import { ProcessService } from 'src/modules/process/ProcessService';
import {
  Exam,
  ExamAccessType,
  ExamDocument,
} from 'src/modules/exam/models/exam.model';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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
@Processor(EXAM_SCHEDULER_QUEUE)
export class ExamSchedulerProcessor {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
  ) {}

  async handleOpenExam(job: Job<{ examId: string }>) {
    await this.examModel.updateOne(
      { _id: job.data.examId, access: ExamAccessType.SCHEDULED },
      { $set: { access: ExamAccessType.OPEN } },
    );
  }
}
