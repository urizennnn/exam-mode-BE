import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  checkHealth(): string {
    return 'v4.0.0 - OK';
  }
}
