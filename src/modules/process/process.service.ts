import * as pdfparse from 'pdf-parse';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

@Injectable()
export class ProcessService {
  private ai: GoogleGenerativeAI;
  private readonly prompt =
    "You will be an exam pdf parser, that will receive a bunch of extracted pdf text and return an array of questions and it's answers in such a way that each array contains the questions and the options given for that questions. This is the first assumption, for the second you will return the same thing but if there are no questions for it return them as they are but still in array format. Return only this array and nothing else.";
  private readonly model: GenerativeModel;

  constructor() {
    this.ai = new GoogleGenerativeAI(process.env.GEMINI_KEY as string);
    this.model = this.ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  async processPdf(file: Express.Multer.File) {
    try {
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('Invalid file type');
      }
      const text = await pdfparse(file.buffer);
      const extracted = text.text.trim();
      const result = await this.model.generateContent([this.prompt, extracted]);
      let res = result.response.text();
      res = res.replaceAll('```json', '');
      res = res.replaceAll('```', '');
      return res;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
