import { Module, forwardRef } from '@nestjs/common';
import { ProcessController } from './process.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Exam, ExamSchema } from '../exam/models/exam.model';
import { QueueModule } from 'src/lib/queue/queue.module';
import { AwsService } from 'src/lib/aws/aws.service';
import { ProcessService } from './process.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Exam.name,
        schema: ExamSchema,
      },
    ]),
    forwardRef(() => QueueModule),
  ],
  controllers: [ProcessController],
  providers: [ProcessService, AwsService],
  exports: [ProcessService],
})
export class ProcessModule {}
