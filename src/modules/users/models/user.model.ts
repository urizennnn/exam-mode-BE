import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { hash } from 'argon2';
import { IUser } from '../interface';

export enum UserRole {
  ADMIN = 'admin',
  LECTURER = 'lecturer',
}

@Schema({ collection: 'users', timestamps: true })
export class User implements IUser {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: false, type: Boolean })
  isSignedIn?: boolean;

  @Prop({
    required: true,
    enum: UserRole,
    default: UserRole.LECTURER,
  })
  role: UserRole;

  @Prop({ type: String, default: null })
  sessionId?: string | null;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre<UserDocument>('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await hash(this.password);
  }
  next();
});
