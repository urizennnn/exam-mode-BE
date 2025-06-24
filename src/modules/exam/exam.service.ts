import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Express } from 'express';
import { ConfigService } from '@nestjs/config';
import { Exam, ExamDocument, ExamAccessType } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import {
  sendInvite,
  sendTranscript,
  returnEmails,
  returnNames,
} from './utils/exam.utils';
import { EXAM_SCHEDULER_QUEUE } from 'src/utils/constants';
import { User, UserDocument } from '../users/models/user.model';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectQueue(EXAM_SCHEDULER_QUEUE) private readonly scheduleQueue: Queue,
  ) {}

  async searchExam(key: string) {
    return this.examModel
      .find({ examKey: { $regex: key, $options: 'i' } })
      .exec();
  }

  async createExam(dto: CreateExamDto, _file?: Express.Multer.File) {
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

  async updateExam(examId: string, dto: Partial<Exam>) {
    await this.examModel.updateOne({ _id: examId }, dto).exec();
    return { message: 'Exam updated successfully' };
  }

  async dropEmailFromInvite(email: string, key: string) {
    await this.examModel.updateOne(
      { examKey: key },
      { $pull: { invites: email.toLowerCase() } },
    );
    return { message: 'Email removed' };
  }

  async sendInvites(
    id: string,
    dto: Invite,
    lecturer: string | Types.ObjectId,
    file?: Express.Multer.File,
  ) {
    const exam = await this.examModel.findById(id).exec();
    if (!exam) throw new NotFoundException('Exam not found');
    if (!exam.lecturer.equals(new Types.ObjectId(lecturer)))
      throw new BadRequestException('User does not own this exam');

    let emails: string[] = [];
    let names: string[] = [];
    if (file) {
      emails = returnEmails(file);
      names = returnNames(file);
    }
    if (dto.emails) emails.push(...dto.emails);
    if (dto.names) names.push(...dto.names);

    emails = emails.map((e) => e.toLowerCase());
    exam.invites = Array.from(new Set([...(exam.invites ?? []), ...emails]));
    await exam.save();

    const recipients = emails.map((email, idx) => ({
      email,
      name: names[idx] || 'Student',
    }));

    const link =
      exam.link ||
      `${new ConfigService().get('URL')}/student/${exam.id}?mode=student`;
    await sendInvite(
      recipients,
      exam.examName,
      exam.examKey,
      link,
      new Date().toISOString(),
    );
    return { message: 'Invites sent' };
  }

  async updateSubmission(id: string, dto: { email: string; transcript: string }) {
    const exam = await this.examModel.findById(id).exec();
    if (!exam) throw new NotFoundException('Exam not found');
    const email = dto.email.toLowerCase();
    const submission = exam.submissions.find((s) => s.email === email);
    if (submission) {
      submission.transcript = dto.transcript;
    } else {
      exam.submissions.push({
        email,
        studentAnswer: '',
        score: 0,
        transcript: dto.transcript,
        timeSubmitted: new Date().toISOString(),
        timeSpent: 0,
      });
    }
    await exam.save();
    return { message: 'Submission updated' };
  }

  async studentLogout(_key: string, _email: string) {
    return { message: 'Logged out' };
  }

  async sendExamBack(id: string, email: string | string[]) {
    // In real implementation we would upload PDF and email link
    await sendTranscript(
      Array.isArray(email) ? email[0] : email,
      'transcript-link',
      'Exam',
    );
    return { message: 'Transcript sent' };
  }

  async duplicateExam(id: string, examKey: string) {
    const exam = await this.examModel.findById(id).lean().exec();
    if (!exam) throw new NotFoundException('Exam not found');
    delete (exam as any)._id;
    const dup = new this.examModel({ ...exam, examKey });
    await dup.save();
    return { message: 'Exam duplicated', examId: dup._id };
  }

  async scheduleExam(id: string, date: Date) {
    const exam = await this.examModel.findById(id).exec();
    if (!exam) throw new NotFoundException('Exam not found');
    exam.access = ExamAccessType.SCHEDULED;
    await exam.save();
    await this.scheduleQueue.add(
      'open-exam',
      { examId: exam._id },
      { delay: Math.max(date.getTime() - Date.now(), 0) },
    );
    return { message: 'Exam scheduled' };
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
