import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

import { Exam, ExamDocument, ExamAccessType } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import { User, UserDocument } from '../users/models/user.model';

import { EXAM_SCHEDULER_QUEUE } from 'src/utils/constants';
import {
  sendInvite,
  sendTranscript,
  returnEmails,
  returnNames,
} from './utils/exam.utils';

import { AppEvents } from 'src/lib/events/events.service';
import {
  STUDENT_IN_EVENT,
  STUDENT_OUT_EVENT,
} from 'src/lib/events/events.constants';
import { DocentiLogger } from 'src/lib/logger';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectQueue(EXAM_SCHEDULER_QUEUE) private readonly scheduleQueue: Queue,
    private readonly events: AppEvents,
    private readonly config: ConfigService,
    private readonly logger: DocentiLogger,
  ) {
    this.events.on(STUDENT_IN_EVENT, (examId: string) => {
      this.handleStudentIn(examId).catch((err: unknown) => {
        this.logger.error(
          'handleStudentIn error',
          (err as Error).stack ?? String(err),
        );
      });
    });
    this.events.on(STUDENT_OUT_EVENT, (examId: string) => {
      this.handleStudentOut(examId).catch((err: unknown) => {
        this.logger.error(
          'handleStudentOut error',
          (err as Error).stack ?? String(err),
        );
      });
    });
  }

  async searchExam(key: string) {
    try {
      return this.examModel
        .find({ examKey: { $regex: key, $options: 'i' } })
        .exec();
    } catch (err) {
      this.logger.error('searchExam failed', err as Error);
      throw err;
    }
  }

  async createExam(dto: CreateExamDto) {
    try {
      const existing = await this.examModel
        .findOne({ examKey: dto.examKey })
        .exec();
      if (existing) {
        existing.set({ ...dto, lecturer: new Types.ObjectId(dto.lecturer) });
        await existing.save();
        return { message: 'Exam updated successfully' };
      }
      const exam = new this.examModel({
        ...dto,
        lecturer: new Types.ObjectId(dto.lecturer),
      });
      await exam.save();
      return { message: 'Exam created successfully' };
    } catch (err) {
      this.logger.error('createExam failed', err as Error);
      throw err;
    }
  }

  async getExamByIdOrKey(id: string): Promise<Exam> {
    try {
      const isObjectId = isValidObjectId(id);
      const criteria = isObjectId
        ? { $or: [{ examKey: id }, { _id: id }] }
        : { examKey: id };

      const exam = await this.examModel.findOne(criteria).exec();
      if (!exam) throw new NotFoundException('Exam not found');
      return exam;
    } catch (err) {
      this.logger.error('getExamByIdOrKey failed', err as Error);
      throw err;
    }
  }

  async getAllExams() {
    try {
      return this.examModel.find().exec();
    } catch (err) {
      this.logger.error('getAllExams failed', err as Error);
      throw err;
    }
  }

  async deleteExam(examId: string) {
    try {
      const result = await this.examModel.deleteOne({ _id: examId }).exec();
      if (result.deletedCount === 0)
        throw new NotFoundException('Exam not found');
      return { message: 'Exam deleted successfully' };
    } catch (err) {
      this.logger.error('deleteExam failed', err as Error);
      throw err;
    }
  }

  async deleteManyExams(examIds: string[]) {
    try {
      const objectIds = examIds.map((id) => new Types.ObjectId(id));
      const result = await this.examModel
        .deleteMany({ _id: { $in: objectIds } })
        .exec();
      if (result.deletedCount === 0)
        throw new NotFoundException('No exams found for the provided IDs');
      return { message: 'Exams deleted successfully' };
    } catch (err) {
      this.logger.error('deleteManyExams failed', err as Error);
      throw err;
    }
  }

  async updateExam(examId: string, dto: Partial<Exam>) {
    try {
      await this.examModel.updateOne({ _id: examId }, dto).exec();
      return { message: 'Exam updated successfully' };
    } catch (err) {
      this.logger.error('updateExam failed', err as Error);
      throw err;
    }
  }

  async dropEmailFromInvite(email: string, key: string) {
    try {
      await this.examModel.updateOne(
        { examKey: key },
        { $pull: { invites: { email: email.toLowerCase() } } },
      );
      return { message: 'Email removed' };
    } catch (err) {
      this.logger.error('dropEmailFromInvite failed', err as Error);
      throw err;
    }
  }

  async sendInvites(
    id: string,
    dto: Invite,
    lecturer: string | Types.ObjectId,
    file?: Express.Multer.File,
  ) {
    try {
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

      const newInvites = emails.map((e, i) => ({
        email: e.toLowerCase(),
        name: names[i] || 'Student',
      }));

      newInvites.forEach((inv) => {
        const exists = exam.invites.find((i) => i.email === inv.email);
        if (exists) exists.name = inv.name;
        else exam.invites.push(inv);
      });
      await exam.save();

      const link =
        exam.link ||
        `${this.config.get('URL')}/student/${exam.id}?mode=student`;
      await sendInvite(
        newInvites,
        exam.examName,
        exam.examKey,
        link,
        new Date().toISOString(),
      );

      return { message: 'Invites sent' };
    } catch (err) {
      this.logger.error('sendInvites failed', err as Error);
      throw err;
    }
  }

  async updateSubmission(
    id: string,
    dto: { email: string; transcript: string },
  ) {
    try {
      const exam = await this.examModel.findById(id).exec();
      if (!exam) throw new NotFoundException('Exam not found');

      const email = dto.email.toLowerCase();
      const sub = exam.submissions.find((s) => s.email === email);
      if (sub) {
        sub.transcript = dto.transcript;
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
    } catch (err) {
      this.logger.error('updateSubmission failed', err as Error);
      throw err;
    }
  }

  async studentLogin(examKey: string, email: string) {
    try {
      this.logger.log(
        `Student login attempt: key="${examKey}", email="${email}"`,
      );
      const exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) throw new NotFoundException('Exam not found');

      if (
        exam.invites.length > 0 &&
        !exam.invites.some((i) => i.email === email.toLowerCase())
      ) {
        throw new BadRequestException('Student not invited for this exam');
      }

      if (exam.invites.length === 0 && exam.access === ExamAccessType.CLOSED) {
        throw new BadRequestException('This exam is closed');
      }

      // fire the "in" event
      this.events.emit(STUDENT_IN_EVENT, exam._id.toString());

      const questions = Array.isArray(exam.question_text)
        ? [...exam.question_text]
        : [];
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }

      return {
        id: exam._id,
        examName: exam.examName,
        examKey: exam.examKey,
        questions,
      };
    } catch (err) {
      this.logger.error('studentLogin failed', err as Error);
      throw err;
    }
  }

  async studentLogout(examKey: string, email: string | unknown) {
    try {
      const emailStr = String(email);
      this.logger.log(`Student logout: key="${examKey}", email="${emailStr}"`);
      const exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) throw new NotFoundException('Exam not found');

      // fire the "out" event
      this.events.emit(STUDENT_OUT_EVENT, exam._id.toString());
      return { message: 'Logout successful' };
    } catch (err) {
      this.logger.error('studentLogout failed', err as Error);
      throw err;
    }
  }

  async sendExamBack(id: string, email: string | string[]) {
    try {
      const exam = await this.examModel.findById(id).exec();
      if (!exam) throw new NotFoundException('Exam not found');

      const list = Array.isArray(email) ? email : [email];
      for (const addr of list) {
        const lowered = addr.toLowerCase();
        const sub = exam.submissions.find((s) => s.email === lowered);
        if (!sub)
          throw new BadRequestException(`No submission for email ${addr}`);
        if (!sub.transcript)
          throw new BadRequestException(`Transcript not generated for ${addr}`);
        await sendTranscript(addr, sub.transcript, exam.examName);
      }

      return {
        message: `Transcript sent to ${list.length} student${list.length > 1 ? 's' : ''} successfully`,
      };
    } catch (err) {
      this.logger.error('sendExamBack failed', err as Error);
      throw err;
    }
  }

  async duplicateExam(id: string, examKey: string) {
    try {
      const exam = await this.examModel.findById(id).lean().exec();
      if (!exam) throw new NotFoundException('Exam not found');

      const { _id: _unused, ...rest } = exam as Record<string, unknown>;
      void _unused;
      const dup = new this.examModel({ ...rest, examKey });
      await dup.save();
      return { message: 'Exam duplicated', examId: dup._id };
    } catch (err) {
      this.logger.error('duplicateExam failed', err as Error);
      throw err;
    }
  }

  async scheduleExam(id: string, date: Date) {
    try {
      const exam = await this.examModel.findById(id).exec();
      if (!exam) throw new NotFoundException('Exam not found');

      exam.access = ExamAccessType.SCHEDULED;
      await exam.save();

      const delay = Math.max(date.getTime() - Date.now(), 0);
      await this.scheduleQueue.add(
        'open-exam',
        { examId: exam._id },
        { delay },
      );
      return { message: 'Exam scheduled' };
    } catch (err) {
      this.logger.error('scheduleExam failed', err as Error);
      throw err;
    }
  }

  // -- private event handlers --

  private async handleStudentIn(examId: string) {
    await this.examModel
      .updateOne({ _id: examId }, { $inc: { ongoing: 1 } })
      .exec();
    this.logger.verbose(`Ongoing++ for exam ${examId}`);
  }

  private async handleStudentOut(examId: string) {
    await this.examModel
      .updateOne({ _id: examId }, { $inc: { ongoing: -1 } })
      .exec();
    this.logger.verbose(`Ongoing-- for exam ${examId}`);
  }
}
