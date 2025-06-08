import { applyDecorators } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CreateExamDto } from '../dto/create-exam.dto';
import { Invite } from '../dto/invite-students.dto';

export const ExamControllerSwagger = {
  controller: applyDecorators(ApiTags('exams')),

  searchExam: applyDecorators(
    ApiOperation({ summary: 'Search exams by key substring' }),
    ApiParam({
      name: 'key',
      description: 'Substring to search within exam keys',
      schema: { type: 'string' },
    }),
    ApiResponse({ status: 200, description: 'List of matching exams' }),
  ),

  createExam: applyDecorators(
    ApiOperation({ summary: 'Create a new exam' }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          dto: { $ref: getSchemaPath(CreateExamDto) },
          file: {
            type: 'string',
            format: 'binary',
            description: 'PDF file containing exam questions',
          },
        },
        required: ['dto'],
      },
    }),
    ApiResponse({ status: 201, description: 'Created exam object' }),
  ),

  getExam: applyDecorators(
    ApiOperation({ summary: 'Get exam by ID' }),
    ApiParam({
      name: 'id',
      description: 'Unique identifier of the exam',
      schema: { type: 'string' },
    }),
    ApiResponse({ status: 200, description: 'Exam object' }),
  ),

  dropEmailFromInvite: applyDecorators(
    ApiOperation({
      summary: 'Remove an invited student by email from an exam',
    }),
    ApiParam({ name: 'email', schema: { type: 'string', format: 'email' } }),
    ApiParam({ name: 'key', schema: { type: 'string' } }),
    ApiResponse({ status: 200, description: 'Updated exam invites list' }),
  ),

  updateExam: applyDecorators(
    ApiOperation({ summary: 'Partially update an exam' }),
    ApiParam({ name: 'id', schema: { type: 'string' } }),
    ApiBody({
      schema: { type: 'object', description: 'Partial exam payload' },
    }),
    ApiResponse({ status: 200, description: 'Updated exam' }),
  ),

  getAllExams: applyDecorators(
    ApiOperation({ summary: 'Retrieve all exams' }),
    ApiResponse({ status: 200, description: 'Array of exams' }),
  ),

  deleteExam: applyDecorators(
    ApiOperation({ summary: 'Delete an exam by ID' }),
    ApiParam({ name: 'id', schema: { type: 'string' } }),
    ApiResponse({ status: 200, description: 'Deletion result' }),
  ),

  deleteManyExams: applyDecorators(
    ApiOperation({ summary: 'Delete multiple exams' }),
    ApiBody({
      schema: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of exam IDs to delete',
      },
    }),
    ApiResponse({ status: 200, description: 'Deletion results for each ID' }),
  ),

  sendInvites: applyDecorators(
    ApiOperation({
      summary: 'Invite students via file upload and manual entry',
    }),
    ApiParam({ name: 'id', schema: { type: 'string' } }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          dto: { $ref: getSchemaPath(Invite) },
          file: {
            type: 'string',
            format: 'binary',
            description: 'CSV file containing additional invites',
          },
        },
        required: ['dto'],
      },
    }),
    ApiResponse({ status: 200, description: 'Invitation results' }),
  ),

  updateSubmission: applyDecorators(
    ApiOperation({ summary: 'Update a student submission transcript' }),
    ApiParam({ name: 'id', schema: { type: 'string' } }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          transcript: { type: 'string' },
        },
        required: ['email', 'transcript'],
      },
    }),
    ApiResponse({ status: 200, description: 'Submission update result' }),
  ),

  studentLogin: applyDecorators(
    ApiOperation({
      summary: 'Authenticate a student using exam key and email',
    }),
    ApiParam({ name: 'key', schema: { type: 'string' } }),
    ApiBody({
      schema: {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
        required: ['email'],
      },
    }),
    ApiResponse({ status: 200, description: 'Login success or failure' }),
  ),
};
