import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UpstashService } from './upstash.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [UpstashService],
  exports: [UpstashService],
})
export class UpstashModule {}
