import { Controller, Post, Body } from '@nestjs/common';
import { InviteUserDto } from './invite.dto';
import { UserService } from './user.service';
import { NeedsAuth, Roles } from 'src/common';
import { UserRole } from './models/user.model';
import { InviteControllerSwagger as docs } from './docs/swagger';

@docs.controller
@Controller('invites')
export class InviteController {
  constructor(private readonly users: UserService) {}

  @NeedsAuth()
  @Roles(UserRole.ADMIN)
  @docs.create
  @Post()
  async invite(@Body() dto: InviteUserDto) {
    return this.users.invite(dto);
  }
}
