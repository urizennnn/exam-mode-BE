import { Module, forwardRef } from '@nestjs/common';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Exam, ExamSchema } from '../exam/models/exam.model';
import { QueueModule } from 'src/lib/queue/queue.module';

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
  providers: [ProcessService],
  exports: [ProcessService],
})
export class ProcessModule {}
