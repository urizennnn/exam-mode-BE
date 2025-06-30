import { All, Controller, HttpException, HttpStatus } from '@nestjs/common';

@Controller('*')
export class DefaultErrorController {
  @All()
  handle(): never {
    throw new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
