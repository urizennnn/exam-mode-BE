import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamDocument, ExamAccessType } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import { User, UserDocument } from '../users/models/user.model';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

  async updateExam(examId: string, dto: Invite, lecturer: Types.ObjectId) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const user = await this.userModel.findById(lecturer).exec();
    if (!user) throw new NotFoundException('User not Found');

    if (!exam.lecturer.equals(lecturer)) {
      throw new BadRequestException(
        'User does not have permission to send invitation',
      );
    }

    dto.emails.forEach((email) => {
      if (!email.includes('@')) {
        throw new BadRequestException('Invalid email address');
      }
      if (exam.invites.includes(email.toLowerCase())) {
        throw new BadRequestException('Email already invited');
      }
      email.toLowerCase();
      exam.invites.push(email);
    });
    await exam.save();
    return { message: 'Exam updated successfully' };
  }

  async studentLogin(email: string, examKey: string) {
    const exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    if (
      exam.access !== ExamAccessType.OPEN &&
      !exam.invites.includes(email.toLowerCase())
    ) {
      throw new BadRequestException('Student not invited for this exam');
    }

    const questions = [...exam.question_text];
    for (let i = questions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    return {
      examName: exam.examName,
      examKey: exam.examKey,
      questions,
    };
  }
}
