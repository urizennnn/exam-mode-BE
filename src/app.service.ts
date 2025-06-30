import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    try {
      return 'Hello World!';
    } catch (err) {
      throw err;
    }
  }

  checkHealth(): string {
    try {
      return 'v4.0.0 - OK';
    } catch (err) {
      throw err;
    }
  }
}
