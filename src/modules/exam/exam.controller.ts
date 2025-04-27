import { Controller, Post, Get, Param, Body, Delete } from '@nestjs/common';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Post()
  async createExam(@Body() dto: CreateExamDto) {
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
}
