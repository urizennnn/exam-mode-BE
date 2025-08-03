import { Module } from '@nestjs/common';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Complaint, ComplaintSchema } from './complaint.model';
import { User, UserSchema } from '../users/models/user.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Complaint.name, schema: ComplaintSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ComplaintController],
  providers: [ComplaintService],
  exports: [MongooseModule, ComplaintService],
})
export class ComplaintModule {}
