import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PDF_QUEUE } from 'src/utils/constants';
import { PdfQueueConsumer } from './queue.consumer';
import { PdfQueueProducer } from './queue.producer';
import { ProcessModule } from 'src/modules/process/process.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          url: cfg.get('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue({ name: PDF_QUEUE }),
    forwardRef(() => ProcessModule),
  ],
  providers: [PdfQueueProducer, PdfQueueConsumer],
  exports: [BullModule, PdfQueueProducer],
})
export class QueueModule {}
