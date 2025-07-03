import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

@Injectable()
export class UpstashService {
  public readonly client: Redis | null;
  public readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('UPSTASH_REDIS_URL');
    const token = this.config.get<string>('UPSTASH_REDIS_TOKEN');
    if (url && token) {
      this.client = new Redis({ url, token });
      this.enabled = true;
    } else {
      this.client = null;
      this.enabled = false;
    }
  }

  async set(key: string, value: string) {
    if (!this.client) return;
    await this.client.set(key, value);
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (!this.client) return null;
    return (await this.client.get<T>(key)) as T | null;
  }
}
