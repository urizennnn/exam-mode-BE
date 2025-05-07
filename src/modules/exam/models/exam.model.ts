import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { SendgridService } from 'src/modules/email/email.service';

export enum ExamAccessType {
  OPEN = 'open',
  PRIVATE = 'private',
  RESTRICTED = 'restricted',
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
  invites: string[];

  @Prop()
  file?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lecturer: Types.ObjectId;

  @Prop()
  format: any[];

  @Prop({ type: Settings, required: true })
  settings: Settings;
}

export type ExamDocument = HydratedDocument<Exam>;
export const ExamSchema = SchemaFactory.createForClass(Exam);

ExamSchema.pre<ExamDocument>('save', async function (next) {
  if (!this.isModified('invites')) return next();
  this.invites = this.invites.map((invite) => invite.toLowerCase());
  const sg = new SendgridService(new ConfigService());
  await Promise.all(
    this.invites.map((to) =>
      sg.send({
        to,
        subject: `Invitation to take exam: ${this.examName}`,
        html: `<p>You have been invited to take the exam <strong>${this.examName}</strong>.</p><p>Your access key is: <strong>${this.examKey}</strong></p>`,
      }),
    ),
  );
  next();
});
