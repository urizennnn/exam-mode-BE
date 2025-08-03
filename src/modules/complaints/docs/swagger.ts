import { applyDecorators } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CreateComplaintDto } from '../complaint.dto';

export const ComplaintControllerSwagger = {
  controller: applyDecorators(ApiTags('complaints')),

  create: applyDecorators(
    ApiOperation({ summary: 'Submit a complaint' }),
    ApiBody({ type: CreateComplaintDto }),
    ApiResponse({ status: 201, description: 'Created complaint' }),
  ),

  list: applyDecorators(
    ApiOperation({ summary: 'List complaints' }),
    ApiResponse({ status: 200, description: 'Array of complaints' }),
  ),
};
