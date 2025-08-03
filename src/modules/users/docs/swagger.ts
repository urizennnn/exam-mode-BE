import { applyDecorators } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { InviteUserDto } from '../invite.dto';

export const UserControllerSwagger = {
  controller: applyDecorators(ApiTags('users')),

  list: applyDecorators(
    ApiOperation({ summary: 'Get all users' }),
    ApiResponse({ status: 200, description: 'Array of users' }),
  ),

  forceLogout: applyDecorators(
    ApiOperation({ summary: 'Force logout user' }),
    ApiParam({ name: 'id', schema: { type: 'string' } }),
    ApiResponse({ status: 200, description: 'User logged out' }),
  ),
};

export const InviteControllerSwagger = {
  controller: applyDecorators(ApiTags('invites')),

  create: applyDecorators(
    ApiOperation({ summary: 'Invite a new member' }),
    ApiBody({ type: InviteUserDto }),
    ApiResponse({ status: 201, description: 'Invitation sent' }),
  ),
};
