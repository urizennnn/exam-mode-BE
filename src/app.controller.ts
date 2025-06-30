import {
  Controller,
  Get,
  All,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  checkHealth(): string {
    return this.appService.checkHealth();
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @All('error')
  handle(): never {
    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
