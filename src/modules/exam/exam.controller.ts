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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Express } from 'express';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { NeedsAuth } from 'src/common';
import { Invite } from './dto/invite-students.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Exam } from './models/exam.model';
import { ExamControllerSwagger as docs } from './docs/swagger';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @docs.searchExam
  @Get('search/:key')
  async searchExam(@Param('key') key: string) {
    return this.examService.searchExam(key);
  }

  @docs.createExam
  @NeedsAuth()
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async createExam(
    @Body() dto: CreateExamDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const user = req.user!.id;
    dto.lecturer = user as unknown as string;
    return this.examService.createExam(dto, file);
  }

  @docs.getExam
  @Get(':id')
  async getExam(@Param('id') id: string) {
    return this.examService.getExamByIdOrKey(id);
  }

  @docs.dropEmailFromInvite
  @NeedsAuth()
  @Post('drop-invite/:email/:key')
  async dropEmailFromInvite(
    @Param('email') email: string,
    @Param('key') key: string,
  ) {
    return this.examService.dropEmailFromInvite(email, key);
  }

  @docs.updateExam
  @NeedsAuth()
  @Patch('update/:id')
  async updateExam(@Param('id') id: string, @Body() dto: Partial<Exam>) {
    return this.examService.updateExam(id, dto);
  }

  @docs.getAllExams
  @Get()
  async getAllExams() {
    return this.examService.getAllExams();
  }

  @docs.deleteExam
  @Delete(':id')
  async deleteExam(@Param('id') id: string) {
    return this.examService.deleteExam(id);
  }
  @docs.deleteManyExams
  @Patch('/delete/many')
  async deleteManyExams(@Body() ids: string[]) {
    return this.examService.deleteManyExams(ids);
  }

  @docs.sendInvites
  @NeedsAuth()
  @UseInterceptors(FileInterceptor('file'))
  @Put('/invite/:id')
  async sendInvites(
    @Param('id') id: string,
    @Body() dto: Invite,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const user = req.user!.id;
    return this.examService.sendInvites(id, dto, user, file);
  }

  @docs.updateSubmission
  @NeedsAuth()
  @Patch(':id/submissions')
  async updateSubmission(
    @Param('id') id: string,
    @Body() dto: { email: string; transcript: string },
  ) {
    return this.examService.updateSubmission(id, dto);
  }

  @docs.studentLogin
  @Post(':key')
  async studentLogin(
    @Param('key') key: string,
    @Body() email: { email: string },
  ) {
    console.log('Student login attempt with key:', key, 'and email:', email);
    return this.examService.studentLogin(key, email.email);
  }

  @Post(':key/logout')
  async studentLogout(
    @Param('key') key: string,
    @Body() email: { email: string },
  ) {
    return this.examService.studentLogout(key, email.email);
  }

  @NeedsAuth()
  @Post(':id/send')
  async sendExamBack(
    @Param('id') id: string,
    @Body() body: { email: string | Array<string> },
  ) {
    return this.examService.sendExamBack(id, body.email);
  }
  @NeedsAuth()
  @Post(':id/duplicate')
  async duplicateExam(
    @Param('id') id: string,
    @Body() body: { examKey: string },
  ) {
    return this.examService.duplicateExam(id, body.examKey);
  }
  @NeedsAuth()
  @Post(':id/schedule')
  async scheduleExam(
    @Param('id') id: string,
    @Body() dto: { startAt: string },
  ) {
    return this.examService.scheduleExam(id, new Date(dto.startAt));
  }
}
