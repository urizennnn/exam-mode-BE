import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamDocument } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import { User, UserDocument } from '../users/models/user.model';
import { JwtService } from '@nestjs/jwt';
import { sendInvite } from './utils/exam.utils';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
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
    let exam = await this.examModel.findOne({ examKey: examId }).exec();
    if (!exam) {
      exam = await this.examModel.findById(examId).exec();
    }
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

    const invites: Array<string> = [];
    const user = await this.userModel.findById(lecturer).exec();
    if (!user) throw new NotFoundException('User not Found');

    dto.emails.forEach((email) => {
      if (!email.includes('@')) {
        throw new BadRequestException('Invalid email address');
      }
      if (exam.invites.includes(email.toLowerCase())) {
        throw new BadRequestException('Email already invited');
      }
      email.toLowerCase();
      exam.invites.push(email);
      invites.push(email);
    });
    await sendInvite(invites, exam.link, exam.examName);
    await exam.save();
    return { message: 'Exam updated successfully' };
  }

  async studentLogin(examKey: string, email: string) {
    const exam = await this.examModel.findOne({ examKey: examKey }).exec();
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (!exam.invites.includes(email.toLowerCase())) {
      throw new BadRequestException('Email not invited');
    }
    exam.submissions.forEach((s) => {
      if (s.email === email.toLowerCase()) {
        throw new BadRequestException('Email already submitted');
      }
    });
    const token = await this.jwtService.signAsync({ email, mode: 'student' });
    return { access_token: token, exam };
  }

  async updateSubmission(
    examId: string,
    dto: { email: string; transcript: string },
  ) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const submission = exam.submissions.find((s) => s.email === dto.email);
    if (!submission) throw new NotFoundException('Submission not found');

    submission.transcript = dto.transcript;
    await exam.save();
    return { message: 'Transcript updated successfully' };
  }
  async dropEmailFromInvite(email: string, examKey: string) {
    console.log('email', email);
    console.log('examKey', examKey);
    let exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) {
      exam = await this.examModel.findById(examKey).exec();
    }
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    exam.invites = exam.invites.filter((e) => e !== email);
    await exam.save();
    return { message: 'Email dropped successfully' };
  }
}
