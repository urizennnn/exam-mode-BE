import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamAccessType, ExamDocument } from './models/exam.model';
import { ParsedQuestion } from './interfaces/exam.interface';
import { CreateExamDto } from './dto/create-exam.dto';
import { Invite } from './dto/invite-students.dto';
import { User, UserDocument } from '../users/models/user.model';
import { JwtService } from '@nestjs/jwt';
import { Express } from 'express';
import {
  returnEmails,
  returnNames,
  sendInvite,
  sendTranscript,
} from './utils/exam.utils';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EXAM_SCHEDULER_QUEUE } from 'src/utils/constants';
import { ProcessService } from '../process/process.service';
import { writeFile } from 'node:fs/promises';
import { AppEvents } from 'src/lib/events/events.service';
import {
  STUDENT_IN_EVENT,
  STUDENT_OUT_EVENT,
} from 'src/lib/events/events.constants';

@Injectable()
export class ExamService {
  private readonly logger = new Logger(ExamService.name);

  private formatError(error: unknown): string {
    return error instanceof Error
      ? (error.stack ?? error.message)
      : String(error);
  }

  constructor(
    @InjectQueue(EXAM_SCHEDULER_QUEUE)
    private readonly queue: Queue<{ examId: string }, unknown, string>,
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly processService: ProcessService,
    private readonly events: AppEvents,
  ) {
    this.events.on(STUDENT_IN_EVENT, (id: string) => {
      this.handleStudentIn(id).catch((e) =>
        this.logger.error('handleStudentIn', this.formatError(e)),
      );
    });
    this.events.on(STUDENT_OUT_EVENT, (id: string) => {
      this.handleStudentOut(id).catch((e) =>
        this.logger.error('handleStudentOut', this.formatError(e)),
      );
    });
  }

  async createExam(dto: CreateExamDto, file?: Express.Multer.File) {
    try {
      this.logger.log(
        `Attempting to create/update exam with key="${dto.examKey}"`,
      );
      const existingExam = await this.examModel
        .findOne({ examKey: dto.examKey })
        .exec();

      if (existingExam) {
        existingExam.set({
          ...dto,
          lecturer: new Types.ObjectId(dto.lecturer),
        });
        await existingExam.save();

        if (file) {
          const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
          await writeFile(tmpPath, file.buffer);
          await this.processService.parsePdfWorker({
            tmpPath,
            examKey: dto.examKey,
          });
        }

        this.logger.log(`Exam "${dto.examKey}" updated successfully`);
        return { message: 'Exam updated successfully' };
      }

      const newExam = new this.examModel({
        ...dto,
        lecturer: new Types.ObjectId(dto.lecturer),
      });
      await newExam.save();

      if (file) {
        const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
        await writeFile(tmpPath, file.buffer);
        await this.processService.parsePdfWorker({
          tmpPath,
          examKey: dto.examKey,
        });
      }

      this.logger.log(
        `Exam "${dto.examKey}" created successfully with id="${newExam._id.toString()}"`,
      );
      return { message: 'Exam created successfully' };
    } catch (error) {
      this.logger.error(
        `createExam failed for key="${dto.examKey}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to create/update exam');
    }
  }

  async getExamById(examId: string) {
    try {
      this.logger.log(`Fetching exam by identifier="${examId}"`);
      let exam = await this.examModel.findOne({ examKey: examId }).exec();
      if (!exam) {
        exam = await this.examModel.findById(examId).exec();
      }
      if (!exam) {
        this.logger.warn(`Exam not found for identifier="${examId}"`);
        throw new NotFoundException('Exam not found');
      }
      this.logger.log(
        `Exam found: id="${exam._id.toString()}", key="${exam.examKey}"`,
      );
      return exam;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `getExamById failed for id="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Error fetching exam');
    }
  }

  async getAllExams() {
    try {
      this.logger.log('Retrieving all exams');
      const exams = await this.examModel.find().exec();
      this.logger.log(`Found ${exams.length} exams`);
      return exams;
    } catch (error) {
      this.logger.error('getAllExams failed', this.formatError(error));
      throw new BadRequestException('Failed to retrieve exams');
    }
  }

  async deleteExam(examId: string) {
    try {
      this.logger.log(`Deleting exam id="${examId}"`);
      const result = await this.examModel.deleteOne({ _id: examId }).exec();
      if (result.deletedCount === 0) {
        this.logger.warn(`No exam deleted for id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }
      this.logger.log(`Exam deleted: id="${examId}"`);
      return { message: 'Exam deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `deleteExam failed for id="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to delete exam');
    }
  }

  async deleteManyExams(examIds: string[]) {
    try {
      this.logger.log(`Deleting multiple exams: [${examIds.join(', ')}]`);
      const objectIds = examIds.map((id) => new Types.ObjectId(id));
      const result = await this.examModel
        .deleteMany({ _id: { $in: objectIds } })
        .exec();
      if (result.deletedCount === 0) {
        this.logger.warn(`No exams deleted for IDs: [${examIds.join(', ')}]`);
        throw new NotFoundException('No exams found for the provided IDs');
      }
      this.logger.log(`Deleted ${result.deletedCount} exams successfully`);
      return { message: 'Exams deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `deleteManyExams failed for IDs=[${examIds.join(', ')}]`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to delete exams');
    }
  }

  async updateExam(examId: string, dto: Partial<Exam>) {
    try {
      this.logger.log(
        `Updating exam id="${examId}" with data=${JSON.stringify(dto)}`,
      );
      const exam = await this.examModel.findById(examId).exec();
      if (!exam) {
        this.logger.warn(`Exam not found for update id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }
      exam.set(dto);
      await exam.save();
      this.logger.log(`Exam updated successfully id="${examId}"`);
      return { message: 'Exam updated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `updateExam failed for id="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to update exam');
    }
  }

  async sendInvites(
    examId: string,
    dto: Invite,
    lecturer: Types.ObjectId,
    file?: Express.Multer.File,
  ) {
    try {
      this.logger.log(
        `Preparing to send invites for examId="${examId}" by lecturer="${lecturer.toString()}"`,
      );
      const exam = await this.examModel.findById(examId).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in sendInvites: id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }

      const user = await this.userModel.findById(lecturer).exec();
      if (!user) {
        this.logger.warn(
          `Lecturer not found in sendInvites: id="${lecturer.toString()}"`,
        );
        throw new NotFoundException('Lecturer not found');
      }

      const newInvites: { email: string; name: string }[] = [];

      if (!file) {
        this.logger.log('Parsing invites from request body arrays');
        if (!Array.isArray(dto.emails) || !Array.isArray(dto.names)) {
          this.logger.warn('Invalid payload: emails[] and names[] required');
          throw new BadRequestException(
            'Both emails[] and names[] arrays are required when no CSV file is provided',
          );
        }
        if (dto.emails.length !== dto.names.length) {
          this.logger.warn(
            'Payload mismatch: emails[] and names[] lengths differ',
          );
          throw new BadRequestException(
            'emails[] and names[] must be the same length',
          );
        }

        for (let i = 0; i < dto.emails.length; i++) {
          const email = String(dto.emails[i]).toLowerCase().trim();
          const name = String(dto.names[i]).trim();

          if (!email.includes('@')) {
            this.logger.warn(`Invalid email format: "${email}"`);
            throw new BadRequestException(`Invalid email: ${email}`);
          }
          if (!name) {
            this.logger.warn(`Missing name for email: "${email}"`);
            throw new BadRequestException(`Name required for email: ${email}`);
          }
          if (exam.invites.some((inv) => inv.email === email)) {
            this.logger.log(`Skipping already invited email: "${email}"`);
            continue;
          }
          newInvites.push({ email, name });
        }
      } else {
        this.logger.log('Parsing invites from uploaded CSV file');
        const rawEmails = returnEmails(file);
        const rawNames = returnNames(file);

        if (rawEmails.length !== rawNames.length) {
          this.logger.warn('CSV email/name count mismatch');
          throw new BadRequestException('CSV name/email count mismatch');
        }

        for (let i = 0; i < rawEmails.length; i++) {
          const email = rawEmails[i]
            .replace(/,+\s*$/, '')
            .toLowerCase()
            .trim();
          const name = rawNames[i].replace(/,+\s*$/, '').trim();

          if (!email.includes('@')) {
            this.logger.warn(`Invalid email in CSV: "${email}"`);
            throw new BadRequestException(`Invalid email: ${email}`);
          }
          if (!name) {
            this.logger.warn(`Missing name in CSV for email: "${email}"`);
            throw new BadRequestException(`Name required for email: ${email}`);
          }
          if (exam.invites.some((inv) => inv.email === email)) {
            this.logger.log(
              `Skipping already invited email in CSV: "${email}"`,
            );
            continue;
          }
          newInvites.push({ email, name });
        }
      }

      if (newInvites.length === 0) {
        this.logger.warn('No new valid invites found to add');
        throw new BadRequestException('No new valid invites to add');
      }

      exam.invites.push(...newInvites);
      exam.invites = exam.invites.filter((i) => i && i.email && i.name);

      this.logger.log(`Sending invite emails to ${newInvites.length} students`);
      await sendInvite(
        exam.invites,
        exam.examName,
        exam.examKey,
        exam.link,
        exam.startDate.toDateString(),
      );
      await exam.save();
      this.logger.log('Invites sent and exam record updated');
      return { message: 'Invites sent and exam updated' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `sendInvites failed for examId="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to send invites');
    }
  }

  async studentLogin(examKey: string, email: string) {
    try {
      this.logger.log(
        `Student login attempt: examKey="${examKey}", email="${email}"`,
      );
      const exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in studentLogin: key="${examKey}"`);
        throw new NotFoundException('Exam not found');
      }
      if (exam.access !== ExamAccessType.OPEN) {
        this.logger.warn(
          `Exam not open for studentLogin: key="${examKey}", access="${exam.access}"`,
        );
        throw new BadRequestException('Exam is not open');
      }
      if (!exam.invites.some((i) => i.email === email.toLowerCase())) {
        this.logger.warn(`Email not invited in studentLogin: email="${email}"`);
        throw new BadRequestException('Email not invited');
      }
      if (exam.submissions.some((s) => s.email === email.toLowerCase())) {
        this.logger.warn(`Duplicate submission attempt: email="${email}"`);
        throw new BadRequestException('Email already submitted');
      }

      this.events.emit(STUDENT_IN_EVENT, exam._id.toString());
      const token = await this.jwtService.signAsync({
        email,
        mode: 'student',
      });

      const questions: ParsedQuestion[] = exam.question_text.map((q) => {
        if (typeof q === 'string') {
          try {
            return JSON.parse(q) as ParsedQuestion;
          } catch {
            return { type: 'theory', question: q } as ParsedQuestion;
          }
        }
        return q;
      });

      const shuffled = [...questions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      this.logger.log(
        `Student login successful, token issued for email="${email}"`,
      );
      return {
        access_token: token,
        exam: { ...exam.toObject(), question_text: shuffled },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `studentLogin failed for examKey="${examKey}", email="${email}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Error during student login');
    }
  }

  async studentLogout(examKey: string, email: string) {
    try {
      this.logger.log(
        `Student logout attempt: examKey="${examKey}", email="${email}"`,
      );
      const exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in studentLogout: key="${examKey}"`);
        throw new NotFoundException('Exam not found');
      }
      this.events.emit(STUDENT_OUT_EVENT, exam._id.toString());
      return { message: 'Logout successful' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `studentLogout failed for examKey="${examKey}", email="${email}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Error during student logout');
    }
  }

  async updateSubmission(
    examId: string,
    dto: { email: string; transcript: string },
  ) {
    try {
      this.logger.log(
        `Updating submission for examId="${examId}", email="${dto.email}"`,
      );
      const exam = await this.examModel.findById(examId).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in updateSubmission: id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }

      const submission = exam.submissions.find((s) => s.email === dto.email);
      if (!submission) {
        this.logger.warn(
          `Submission not found in updateSubmission: email="${dto.email}"`,
        );
        throw new NotFoundException('Submission not found');
      }

      submission.transcript = dto.transcript;
      await exam.save();
      this.logger.log(
        `Transcript updated successfully for email="${dto.email}"`,
      );
      return { message: 'Transcript updated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `updateSubmission failed for examId="${examId}", email="${dto.email}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to update transcript');
    }
  }

  async dropEmailFromInvite(email: string, examKey: string) {
    try {
      this.logger.log(
        `Dropping invite email="${email}" from examKey="${examKey}"`,
      );
      let exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) {
        exam = await this.examModel.findById(examKey).exec();
      }
      if (!exam) {
        this.logger.warn(
          `Exam not found in dropEmailFromInvite: key="${examKey}"`,
        );
        throw new NotFoundException('Exam not found');
      }

      exam.invites = exam.invites.filter((e) => e.email !== email);
      await exam.save();
      this.logger.log(`Email "${email}" dropped successfully from invites`);
      return { message: 'Email dropped successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `dropEmailFromInvite failed for examKey="${examKey}", email="${email}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to drop email from invites');
    }
  }

  async searchExam(examKey: string) {
    try {
      this.logger.log(`Searching exams with text="${examKey}"`);
      const results = await this.examModel
        .find({
          $text: {
            $search: examKey,
          },
        })
        .limit(10)
        .exec();
      this.logger.log(`Found ${results.length} exams for search "${examKey}"`);
      return results;
    } catch (error) {
      this.logger.error(
        `searchExam failed for key="${examKey}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to search exams');
    }
  }

  async sendExamBack(examId: string, email: string | string[]) {
    try {
      const emails = Array.isArray(email) ? email : [email];
      this.logger.log(
        `Sending transcripts for examId="${examId}" to ${emails.join(', ')}`,
      );

      const exam = await this.examModel.findById(examId).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in sendExamBack: id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }

      for (const addr of emails) {
        const lowered = addr.toLowerCase();
        const submission = exam.submissions.find((s) => s.email === lowered);

        if (!submission) {
          this.logger.warn(`No submission found for email="${addr}"`);
          throw new BadRequestException(`No submission for email ${addr}`);
        }
        if (!submission.transcript) {
          this.logger.warn(`Transcript not yet generated for email="${addr}"`);
          throw new BadRequestException(
            `Transcript not yet generated for ${addr}`,
          );
        }

        await sendTranscript(addr, submission.transcript, exam.examName);
        this.logger.log(`Transcript sent to "${addr}" for examId="${examId}"`);
      }

      return {
        message: `Transcript sent to ${emails.length} student${
          emails.length > 1 ? 's' : ''
        } successfully`,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `sendExamBack failed for examId="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to send transcripts');
    }
  }

  async duplicateExam(examId: string, examKey: string) {
    try {
      this.logger.log(
        `Duplicating exam id="${examId}" with new key="${examKey}"`,
      );
      const exam = await this.examModel.findById(examId).exec();
      if (!exam) {
        this.logger.warn(`Exam not found in duplicateExam: id="${examId}"`);
        throw new NotFoundException('Exam not found');
      }

      const newExam = new this.examModel({
        ...exam.toObject(),
        _id: new Types.ObjectId(),
        examName: `${exam.examName} (Copy)`,
        examKey,
        ongoing: 0,
        submissions: [],
      });

      await newExam.save();
      this.logger.log(
        `Exam duplicated successfully: originalId="${examId}", newId="${newExam._id.toString()}"`,
      );
      return { message: 'Exam duplicated successfully', exam: newExam };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `duplicateExam failed for examId="${examId}", newKey="${examKey}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to duplicate exam');
    }
  }

  private async handleStudentIn(examId: string) {
    await this.examModel.updateOne({ _id: examId }, { $inc: { ongoing: 1 } });
    this.logger.verbose(`Incremented ongoing count for exam ${examId}`);
  }

  private async handleStudentOut(examId: string) {
    await this.examModel.updateOne({ _id: examId }, { $inc: { ongoing: -1 } });
    this.logger.verbose(`Decremented ongoing count for exam ${examId}`);
  }

  async scheduleExam(examId: string, startAt: Date) {
    try {
      this.logger.log(
        `Scheduling exam id="${examId}" for date="${startAt.toISOString()}"`,
      );
      if (isNaN(startAt.getTime())) {
        this.logger.warn(
          `Invalid date provided to scheduleExam: "${startAt.toISOString()}"`,
        );
        throw new BadRequestException('Invalid startAt date');
      }

      const exam =
        (await this.examModel.findOne({ examKey: examId })) ??
        (await this.examModel.findById(examId));
      if (!exam) {
        this.logger.warn(`Exam not found in scheduleExam: "${examId}"`);
        throw new NotFoundException('Exam not found');
      }
      if (startAt.getTime() <= Date.now()) {
        this.logger.warn(
          `scheduleExam received past date: now="${new Date().toISOString()}", startAt="${startAt.toISOString()}"`,
        );
        throw new BadRequestException('startAt must be in the future');
      }

      exam.startDate = startAt;
      exam.access = ExamAccessType.SCHEDULED;
      await exam.save();

      const prevJob = await this.queue.getJob(exam._id.toString());
      if (prevJob) {
        this.logger.log(
          `Removing previous schedule job for examId="${exam._id.toString()}"`,
        );
        await prevJob.remove();
      }

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
      this.logger.log(
        `Exam scheduled successfully: examId="${exam._id.toString()}", delay=${delay}ms`,
      );
      return { message: 'Exam scheduled successfully', startAt };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `scheduleExam failed for examId="${examId}"`,
        this.formatError(error),
      );
      throw new BadRequestException('Failed to schedule exam');
    }
  }
}
