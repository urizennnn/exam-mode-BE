import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProcessModule } from './modules/process/process.module';
import { MulterModule } from '@nestjs/platform-express';
import { UserModule } from './modules/users/user.module';
import { ExamModule } from './modules/exam/exam.module';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueModule } from './lib/queue/queue.module';
import { EventsModule } from './lib/events/events.module';
import 'dotenv/config';
import { AwsModule } from './lib/aws/aws.module';
import { RequestLoggerMiddleware } from './common';

@Module({
  imports: [
    MulterModule.registerAsync({
      useFactory: () => ({ dest: './uploads' }),
    }),

    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-secret',
        signOptions: { expiresIn: '1d' },
      }),
    }),

    MongooseModule.forRoot(process.env.MONGO_URI!),
    ProcessModule,
    UserModule,
    ExamModule,
    QueueModule,
    EventsModule,
    AwsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
