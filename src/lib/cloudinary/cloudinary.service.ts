import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  v2 as Cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  constructor(
    @Inject('Cloudinary')
    private readonly cloudinary: typeof Cloudinary,
  ) {}

  uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'uploads',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse,
        ) => {
          if (error) {
            this.logger.error(`Cloudinary upload failed: ${error.message}`);
            return reject(new Error(error.message));
          }
          this.logger.debug(
            `Uploaded file to Cloudinary: ${result.secure_url}`,
          );
          resolve(result);
        },
      );

      uploadStream.end(file.buffer);
    });
  }
}
