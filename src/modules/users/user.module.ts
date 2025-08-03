import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { InviteController } from './invite.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './models/user.model';
import { SessionCleanupService } from './session-cleanup.service';
import { MailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UserController, InviteController],
  providers: [UserService, SessionCleanupService, MailService, ConfigService],
  exports: [MongooseModule],
})
export class UserModule {}
