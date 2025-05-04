import { Injectable, NotFoundException } from '@nestjs/common';
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
      existingExam.set({
        ...dto,
        lecturer: new Types.ObjectId(dto.lecturer),
      });
      await existingExam.save();
      return { message: 'Exam updated successfully' };
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

  async deleteManyExams(examIds: string[]) {
    const objectIds = examIds.map((id) => new Types.ObjectId(id));
    const result = await this.examModel
      .deleteMany({ _id: { $in: objectIds } })
      .exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('No exams found for the provided IDs');
    }
    return { message: 'Exams deleted successfully' };
  }
}
