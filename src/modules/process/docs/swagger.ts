import { applyDecorators } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

export const ProcessControllerSwagger = {
  controller: applyDecorators(ApiTags('process')),

  processPdf: applyDecorators(
    ApiOperation({ summary: 'Extract and parse questions from an exam PDF' }),
    ApiConsumes('multipart/form-data'),
    ApiQuery({
      name: 'examKey',
      description: 'Unique key identifying the exam',
      schema: { type: 'string' },
    }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'The exam PDF file to parse',
          },
        },
        required: ['file'],
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Parsed questions JSON or raw text',
    }),
  ),

  markPdf: applyDecorators(
    ApiOperation({
      summary: 'Mark a student’s exam PDF and record submission',
    }),
    ApiParam({
      name: 'examKey',
      description: 'Unique key identifying the exam in the database',
      schema: { type: 'string' },
    }),
    ApiQuery({
      name: 'email',
      description: 'Student’s email address',
      schema: { type: 'string', format: 'email' },
    }),
    ApiQuery({
      name: 'studentAnswer',
      description: 'The Cloudinary URL of the student’s answer PDF',
      schema: { type: 'string' },
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'The student’s completed exam PDF',
          },
        },
        required: ['file'],
      },
    }),
    ApiResponse({ status: 200, description: 'Score in X/Y format' }),
  ),
};
