import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, LoginUserDto } from './dto/user.dto';
import { Request } from 'express';
import { NeedsAuth } from 'src/common';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('signup')
  async signup(@Body() dto: CreateUserDto) {
    return this.userService.signup(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginUserDto) {
    return this.userService.login(dto);
  }
  @NeedsAuth()
  @Post('logout')
  async logout(@Req() req: Request) {
    const lectureId = req.user?.id;
    if (!lectureId) {
      throw new BadRequestException('Lecturer ID is required');
    }
    return this.userService.logout(lectureId);
  }
}
