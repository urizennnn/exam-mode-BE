import { Module, forwardRef } from '@nestjs/common';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Exam, ExamSchema } from './models/exam.model';
import { User, UserSchema } from '../users/models/user.model';
import { EXAM_SCHEDULER_QUEUE } from 'src/utils/constants';
import { BullModule } from '@nestjs/bullmq';
import { ProcessModule } from '../process/process.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: EXAM_SCHEDULER_QUEUE }),
    MongooseModule.forFeature([
      {
        name: Exam.name,
        schema: ExamSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    forwardRef(() => ProcessModule),
  ],
  controllers: [ExamController],
  providers: [ExamService],
})
export class ExamModule {}
