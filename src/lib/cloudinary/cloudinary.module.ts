import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'Cloudinary',
      useFactory: (config: ConfigService) => {
        cloudinary.config({
          cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
          api_key: config.get<string>('CLOUDINARY_API_KEY'),
          api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
        });
        return cloudinary;
      },
      inject: [ConfigService],
    },
    CloudinaryService,
  ],
  exports: ['Cloudinary', CloudinaryService],
})
export class CloudinaryModule {}
