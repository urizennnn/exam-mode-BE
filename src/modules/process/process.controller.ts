import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcessControllerSwagger as Docs } from './docs/swagger';
import { Express } from 'express';
import { ProcessService } from './process.service';

@Docs.controller
@Controller('process')
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post(':examKey')
  @UseInterceptors(FileInterceptor('file'))
  @Docs.processPdf
  async processPdf(
    @UploadedFile() file: Express.Multer.File,
    @Param('examKey') examKey: string,
  ): Promise<{ jobId: string | undefined }> {
    return this.service.enqueueProcessPdf(file, examKey);
  }

  @Post('mark/:examKey')
  @UseInterceptors(FileInterceptor('file'))
  @Docs.markPdf
  async markPdf(
    @UploadedFile() file: Express.Multer.File,
    @Param('examKey') examKey: string,
    @Query('email') email: string,
    @Query('studentAnswer') studentAnswer: string,
    @Query('timeSpent') timeSpent: string,
  ): Promise<{ jobId: string | undefined; message: string }> {
    console.log('hit');
    return this.service.enqueueMarkPdf(
      file,
      examKey,
      email,
      studentAnswer,
      parseInt(timeSpent, 10) || 0,
    );
  }

  @Get('job/:id')
  async getJob(@Param('id') id: string): Promise<{
    id: any;
    name: any;
    state: any;
    progress: any;
    attemptsMade: any;
    processedOn: any;
    finishedOn: any;
    result: any;
    failedReason: any;
  }> {
    return this.service.getJobInfo(id);
  }
}
