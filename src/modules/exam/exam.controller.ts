import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Delete,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { NeedsAuth } from 'src/common';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @NeedsAuth()
  @Post()
  async createExam(@Body() dto: CreateExamDto, @Req() req: Request) {
    const user = req.user;
    dto.lecturer = user?.id;
    return this.examService.createExam(dto);
  }

  @Get(':id')
  async getExam(@Param('id') id: string) {
    return this.examService.getExamById(id);
  }

  @Get()
  async getAllExams() {
    return this.examService.getAllExams();
  }

  @Delete(':id')
  async deleteExam(@Param('id') id: string) {
    return this.examService.deleteExam(id);
  }
  @Delete('/delete/many')
  async deleteManyExams(@Body() ids: string[]) {
    return this.examService.deleteManyExams(ids);
  }
}
