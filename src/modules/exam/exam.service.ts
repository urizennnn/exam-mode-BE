import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamAccessType, ExamDocument } from './models/exam.model';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import { User, UserDocument } from '../users/models/user.model';
import { JwtService } from '@nestjs/jwt';
import {
  returnEmails,
  returnNames,
  sendInvite,
  sendTranscript,
} from './utils/exam.utils';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EXAM_SCHEDULER_QUEUE } from 'src/utils/constants';

@Injectable()
export class ExamService {
  constructor(
    @InjectQueue(EXAM_SCHEDULER_QUEUE) private readonly queue: Queue,
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

  async updateExam(examId: string, dto: Partial<Exam>) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    exam.set(dto);
    await exam.save();
    return { message: 'Exam updated successfully' };
  }

  async sendInvites(
    examId: string,
    dto: Invite,
    lecturer: Types.ObjectId,
    file?: Express.Multer.File,
  ) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const user = await this.userModel.findById(lecturer).exec();
    if (!user) throw new NotFoundException('User not Found');

    const newInvites: { email: string; name: string }[] = [];

    if (!file) {
      if (!Array.isArray(dto.emails) || !Array.isArray(dto.names)) {
        throw new BadRequestException(
          'Both emails[] and names[] arrays are required when no CSV file is provided',
        );
      }
      if (dto.emails.length !== dto.names.length) {
        throw new BadRequestException(
          'emails[] and names[] must be the same length',
        );
      }

      for (let i = 0; i < dto.emails.length; i++) {
        const email = String(dto.emails[i]).toLowerCase().trim();
        const name = String(dto.names[i]).trim();

        if (!email.includes('@')) {
          throw new BadRequestException(`Invalid email: ${email}`);
        }
        if (!name) {
          throw new BadRequestException(`Name required for email: ${email}`);
        }
        if (exam.invites.some((inv) => inv.email === email)) {
          continue;
        }
        newInvites.push({ email, name });
      }
    } else {
      const rawEmails = returnEmails(file);
      const rawNames = returnNames(file);

      if (rawEmails.length !== rawNames.length) {
        throw new BadRequestException('CSV name/email count mismatch');
      }

      for (let i = 0; i < rawEmails.length; i++) {
        const email = rawEmails[i]
          .replace(/,+\s*$/, '')
          .toLowerCase()
          .trim();
        const name = rawNames[i].replace(/,+\s*$/, '').trim();

        if (!email.includes('@')) {
          throw new BadRequestException(`Invalid email: ${email}`);
        }
        if (!name) {
          throw new BadRequestException(`Name required for email: ${email}`);
        }
        if (exam.invites.some((inv) => inv.email === email)) {
          continue;
        }
        newInvites.push({ email, name });
      }
    }

    if (newInvites.length === 0) {
      throw new BadRequestException('No new valid invites to add');
    }

    exam.invites.push(...newInvites);

    exam.invites = exam.invites.filter((i) => i && i.email && i.name);

    await sendInvite(
      exam.invites,
      exam.examName,
      exam.examKey,
      exam.link,
      exam.startDate.toDateString(),
    );
    await exam.save();

    return { message: 'Invites sent and exam updated' };
  }

  async studentLogin(examKey: string, email: string) {
    const exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.access !== ExamAccessType.OPEN) {
      throw new BadRequestException('Exam is not open');
    }
    if (!exam.invites.some((i) => i.email === email.toLowerCase())) {
      throw new BadRequestException('Email not invited');
    }
    exam.submissions.forEach((s) => {
      if (s.email === email.toLowerCase()) {
        throw new BadRequestException('Email already submitted');
      }
    });
    exam.ongoing += 1;
    await exam.save();
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
    let exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) {
      exam = await this.examModel.findById(examKey).exec();
    }
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    exam.invites = exam.invites.filter((e) => e.email !== email);
    await exam.save();
    return { message: 'Email dropped successfully' };
  }

  async searchExam(examKey: string) {
    return this.examModel
      .find({
        $text: {
          $search: examKey,
        },
      })
      .limit(10)
      .exec();
  }
  async sendExamBack(examId: string, email: string | string[]) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const emails = Array.isArray(email) ? email : [email];

    for (const addr of emails) {
      const lowered = addr.toLowerCase();
      const submission = exam.submissions.find((s) => s.email === lowered);

      if (!submission)
        throw new BadRequestException(`No submission for email ${addr}`);

      if (!submission.transcript)
        throw new BadRequestException(
          `Transcript not yet generated for ${addr}`,
        );

      await sendTranscript(addr, submission.transcript, exam.examName);
    }

    return {
      message: `Transcript sent to ${emails.length} student${
        emails.length > 1 ? 's' : ''
      } successfully`,
    };
  }
  async duplicateExam(examId: string, examKey: string) {
    const exam = await this.examModel.findById(examId).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const newExam = new this.examModel({
      ...exam.toObject(),
      _id: new Types.ObjectId(),
      examName: `${exam.examName} (Copy)`,
      examKey,
      ongoing: 0,
      submissions: [],
    });

    await newExam.save();
    return { message: 'Exam duplicated successfully', exam: newExam };
  }
  async scheduleExam(examId: string, startAt: Date) {
    if (isNaN(startAt.getTime()))
      throw new BadRequestException('Invalid startAt date');

    const exam =
      (await this.examModel.findOne({ examKey: examId })) ??
      (await this.examModel.findById(examId));

    if (!exam) throw new NotFoundException('Exam not found');
    if (startAt.getTime() <= Date.now())
      throw new BadRequestException('startAt must be in the future');

    exam.startDate = startAt;
    exam.access = ExamAccessType.SCHEDULED;
    await exam.save();
    const prev = await this.queue.getJob(exam._id.toString());
    if (prev) await prev.remove();
    const delay = startAt.getTime() - Date.now();
    await this.queue.add(
      'open-exam',
      { examId: exam._id.toString() },
      {
        jobId: exam._id.toString(),
        delay,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return { message: 'Exam scheduled successfully', startAt };
  }
}
