import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BaseModel } from 'src/utils';

@Schema({ collection: 'complaints', timestamps: true })
export class Complaint {
  @Prop({ required: true })
  examCode: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  content: string;
}

export type ComplaintDocument = HydratedDocument<Complaint>;
export const ComplaintSchema = SchemaFactory.createForClass(Complaint);
