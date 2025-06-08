import { Module, forwardRef } from '@nestjs/common';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Exam, ExamSchema } from '../exam/models/exam.model';
import { QueueModule } from 'src/lib/queue/queue.module';
import { CloudinaryService } from 'src/lib/cloudinary/cloudinary.service';

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
  providers: [ProcessService, CloudinaryService],
  exports: [ProcessService],
})
export class ProcessModule {}
