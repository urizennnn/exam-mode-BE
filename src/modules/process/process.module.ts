import { Module } from '@nestjs/common';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';

@Module({
  imports: [],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule {}
