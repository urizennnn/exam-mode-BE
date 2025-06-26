import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { AwsModule } from './lib/aws/aws.module';
import { RequestLoggerMiddleware } from './common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    MulterModule.registerAsync({
      useFactory: () => ({ dest: './uploads' }),
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
      }),
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI')!,
      }),
    }),

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
