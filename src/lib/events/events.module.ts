import { Global, Module } from '@nestjs/common';
import { AppEvents } from './events.service';

@Global()
@Module({
  providers: [AppEvents],
  exports: [AppEvents],
})
export class EventsModule {}
