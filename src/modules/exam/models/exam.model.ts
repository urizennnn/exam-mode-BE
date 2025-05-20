import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Submissions } from '../interfaces/exam.interface';
import { ConfigService } from '@nestjs/config';

export enum ExamAccessType {
  OPEN = 'open',
  CLOSED = 'closed',
  SCHEDULED = 'scheduled',
}

@Schema({ _id: false })
class InviteSchema {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  name: string;
}
@Schema({ _id: false })
class GeneralSettings {
  @Prop({ required: true })
  anonymous: boolean;

  @Prop({ required: true })
  timeLimit: number;
}

@Schema({ _id: false })
class ExamTypeSettings {
  @Prop({ required: true })
  hidePoints: boolean;

  @Prop({ required: true })
  showResults: boolean;
}

@Schema({ _id: false })
class Settings {
  @Prop({ type: GeneralSettings, required: true })
  general: GeneralSettings;

  @Prop({ type: ExamTypeSettings, required: true })
  examType: ExamTypeSettings;
}

@Schema({ collection: 'exams', timestamps: true, strict: false })
export class Exam {
  @Prop({ required: true })
  examName: string;

  @Prop({ required: true, unique: true })
  examKey: string;

  @Prop({ type: String, enum: ExamAccessType, required: true })
  access: ExamAccessType;

  @Prop({ required: false, type: [String] })
  invites: Array<InviteSchema>;

  @Prop({ required: false })
  link: string;

  @Prop({ required: false })
  submissions: Array<Submissions>;

  @Prop({ type: String, required: true })
  question?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lecturer: Types.ObjectId;

  @Prop()
  format: any[];

  @Prop({ type: Settings, required: true })
  settings: Settings;
}

export type ExamDocument = HydratedDocument<Exam>;
export const ExamSchema = SchemaFactory.createForClass(Exam);
ExamSchema.pre<ExamDocument>('save', function (next) {
  if (this.isModified('invites')) {
    const cfg = new ConfigService();
    const URL = cfg.getOrThrow<string>('URL');
    this.link = `${URL}/student-login`;
  }

  if (this.isModified('submissions')) {
    const inviteEmails = this.invites.map((inv) => inv.email.toLowerCase());
    this.submissions = this.submissions
      .map((submission) => ({
        ...submission,
        email: submission.email.toLowerCase(),
      }))
      .filter((submission) => inviteEmails.includes(submission.email));
  }

  next();
});
