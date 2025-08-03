import { Controller, Post, Body, Get } from '@nestjs/common';
import { ComplaintService } from './complaint.service';
import { CreateComplaintDto } from './complaint.dto';
import { NeedsAuth, Roles } from 'src/common';
import { UserRole } from '../users/models/user.model';
import { ComplaintControllerSwagger as docs } from './docs/swagger';

@docs.controller
@Controller('complaints')
export class ComplaintController {
  constructor(private readonly service: ComplaintService) {}

  @docs.create
  @Post()
  async create(@Body() dto: CreateComplaintDto) {
    return this.service.create(dto);
  }

  @NeedsAuth()
  @Roles(UserRole.ADMIN)
  @docs.list
  @Get()
  async list() {
    return this.service.findAll();
  }
}
