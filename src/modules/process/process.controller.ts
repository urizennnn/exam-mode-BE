import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ProcessService } from './process.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('process')
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async processPdf(@UploadedFile() file: Express.Multer.File) {
    return this.service.processPdf(file);
  }
}
