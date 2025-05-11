import { Module } from '@nestjs/common';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Exam, ExamSchema } from '../exam/models/exam.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Exam.name,
        schema: ExamSchema,
      },
    ]),
  ],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule {}
