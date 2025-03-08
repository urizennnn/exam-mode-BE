import * as pdfparse from 'pdf-parse';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ProcessService {
  constructor() {}

  async processPdf(file: Express.Multer.File) {
    try {
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('Invalid file type');
      }
      let text = await pdfparse(file.buffer);
      return text.text.trim();
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
