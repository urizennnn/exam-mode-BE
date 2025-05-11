import { BadRequestException, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Exam, ExamDocument } from '../exam/models/exam.model';
import { PdfQueueProducer } from 'src/lib/queue/queue.producer';

@Injectable()
export class ProcessService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    private readonly pdfQueueProducer: PdfQueueProducer,
  ) {}

  async processPdf(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Invalid file type: only PDF is allowed');

    const job = await this.pdfQueueProducer.enqueueProcessPdf({
      buffer: file.buffer,
      mimetype: file.mimetype,
    });

    return { jobId: job.id };
  }

  async markPdf(
    file: Express.Multer.File,
    examKey: string,
    email: string,
    studentAnswer: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Invalid file type: only PDF is allowed');

    const exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) throw new BadRequestException('Exam not found');

    const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
    await require('fs').promises.writeFile(tmpPath, file.buffer);

    const job = await this.pdfQueueProducer.enqueueMark({
      tmpPath,
      examKey,
      email,
      studentAnswer,
    });

    return { jobId: job.id, message: 'Exam marking job queued successfully' };
  }
}
