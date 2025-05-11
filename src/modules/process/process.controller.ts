import {
  Controller,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcessService } from './process.service';
import { ProcessControllerSwagger as Docs } from './docs/swagger';

@Docs.controller
@Controller('process')
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @Docs.processPdf
  async processPdf(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.service.processPdf(file);
  }

  @Post('mark/:examKey')
  @UseInterceptors(FileInterceptor('file'))
  @Docs.markPdf
  async markPdf(
    @UploadedFile() file: Express.Multer.File,
    @Param('examKey') examKey: string,
    @Query('email') email: string,
    @Query('studentAnswer') studentAnswer: string,
  ) {
    return this.service.markPdf(file, examKey, email, studentAnswer);
  }
}
