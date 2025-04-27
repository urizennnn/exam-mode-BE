import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamDocument } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
  ) {}

  async createExam(dto: CreateExamDto) {
    const existingExam = await this.examModel
      .findOne({ examKey: dto.examKey })
      .exec();
    if (existingExam) {
      throw new BadRequestException('Exam key already exists');
    }

    const newExam = new this.examModel({
      ...dto,
      lecturer: new Types.ObjectId(dto.lecturer),
    });

    await newExam.save();

    return { message: 'Exam created successfully' };
  }

  async getExamById(examId: string) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return exam;
  }

  async getAllExams() {
    return this.examModel.find().exec();
  }

  async deleteExam(examId: string) {
    const result = await this.examModel.deleteOne({ _id: examId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Exam not found');
    }
    return { message: 'Exam deleted successfully' };
  }
}
