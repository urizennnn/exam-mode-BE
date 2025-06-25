import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 } from 'uuid';

@Injectable()
export class AwsService {
  private readonly logger = new Logger(AwsService.name);
  private readonly s3Client: S3Client;

  constructor(private readonly config: ConfigService) {
    const region = this.config.getOrThrow<string>('AWS_REGION');
    const accessKeyId = this.config.getOrThrow<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.config.getOrThrow<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(
    filename: string,
    file: Buffer,
  ): Promise<{ secure_url: string }> {
    const key = `${v4()}-${filename}`;
    try {
      this.logger.debug(`Uploading file to S3: ${key}`);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.config.getOrThrow<string>('AWS_BUCKET_NAME'),
          Key: key,
          ContentType: 'application/pdf',
          // ACL: 'public-read',
          Body: file,
        }),
      );
      this.logger.debug(`File uploaded successfully: ${key}`);
      const url = this.getBucketURL() + key;
      return { secure_url: url };
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to upload file: ${error.message}`);
      }
      return { secure_url: '' };
    }
  }

  private getBucketURL(): string {
    const bucketName = this.config.getOrThrow<string>('AWS_BUCKET_NAME');
    const region = this.config.getOrThrow<string>('AWS_REGION');
    return `https://${bucketName}.s3.${region}.amazonaws.com/`;
  }
}
