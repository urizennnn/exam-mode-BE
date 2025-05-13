import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Delete,
  Req,
  Patch,
  Put,
} from '@nestjs/common';
import { Request } from 'express';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { NeedsAuth } from 'src/common';
import { Invite } from './dto/invite-students.dto';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @NeedsAuth()
  @Post()
  async createExam(@Body() dto: CreateExamDto, @Req() req: Request) {
    const user = req.user!.id;
    dto.lecturer = user as unknown as string;
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
  @Patch('/delete/many')
  async deleteManyExams(@Body() ids: string[]) {
    return this.examService.deleteManyExams(ids);
  }

  @NeedsAuth()
  @Put('/invite/:id')
  async updateExam(
    @Param('id') id: string,
    @Body() dto: Invite,
    @Req() req: Request,
  ) {
    const user = req.user!.id;
    return this.examService.updateExam(id, dto, user);
  }

  @NeedsAuth()
  @Patch(':id/submissions')
  async updateSubmission(
    @Param('id') id: string,
    @Body() dto: { email: string; transcript: string },
  ) {
    return this.examService.updateSubmission(id, dto);
  }

  @Post(':key')
  async studentLogin(
    @Param('key') key: string,
    @Body() email: { email: string },
  ) {
    console.log('body', email);
    console.log('key', key);
    return this.examService.studentLogin(key, email.email);
  }
}
