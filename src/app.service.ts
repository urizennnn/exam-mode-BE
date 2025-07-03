import { Injectable } from '@nestjs/common';
import { UpstashService } from './lib/redis';

@Injectable()
export class AppService {
  constructor(private readonly redis: UpstashService) {}

  async getHello(): Promise<string> {
    if (this.redis.enabled) {
      try {
        await this.redis.set('lastHello', new Date().toISOString());
      } catch {
        // ignore connection errors
      }
    }
    return 'Hello World!';
  }

  checkHealth(): string {
    return 'v4.0.0 - OK';
  }
}
