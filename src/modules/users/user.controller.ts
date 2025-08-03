import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { UserService } from './user.service';
import { CreateUserDto, LoginUserDto } from './dto/user.dto';
import { Request, Response } from 'express';
import * as ms from 'ms';
import { NeedsAuth, Roles } from 'src/common';
import { UserRole } from './models/user.model';
import { UserControllerSwagger as docs } from './docs/swagger';

@docs.controller
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  @Post('signup')
  async signup(@Body() dto: CreateUserDto) {
    return this.userService.signup(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.userService.login(dto);
    const expiresIn = this.config.get<ms.StringValue>('JWT_EXPIRES_IN', '1d');
    const maxAge = ms(expiresIn);
    res.cookie('token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
    });
    return result;
  }
  @NeedsAuth()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const lectureId = req.user?.id;
    if (!lectureId) {
      throw new BadRequestException('Lecturer ID is required');
    }
    res.clearCookie('token');
    return this.userService.logout(lectureId);
  }

  @NeedsAuth()
  @Roles(UserRole.ADMIN)
  @docs.list
  @Get()
  async getAllUsers() {
    return this.userService.findAll();
  }

  @NeedsAuth()
  @Roles(UserRole.ADMIN)
  @docs.forceLogout
  @Post(':id/logout')
  async forceLogout(@Param('id') id: string) {
    return this.userService.forceLogout(new Types.ObjectId(id));
  }
}
