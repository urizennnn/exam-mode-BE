import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sg from '@sendgrid/mail';

interface SendgridSendOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html: string;
  from?: string;
}

interface SendgridTemplateOptions {
  to: string | string[];
  templateId: string;
  dynamicTemplateData: Record<string, unknown>;
  from?: string;
}

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);
  private readonly defaultFrom: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.getOrThrow<string>('SENDGRID_API_KEY') as string;
    this.defaultFrom =
      this.config.getOrThrow<string>('SENDGRID_FROM') ?? 'no-reply@example.com';

    if (!key) {
      this.logger.error('SENDGRID_API_KEY not provided');
    } else {
      sg.setApiKey(key);
    }
  }

  async send(options: SendgridSendOptions) {
    await sg.send({
      from: options.from ?? this.defaultFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }

  async sendTemplate(options: SendgridTemplateOptions) {
    await sg.send({
      from: options.from ?? this.defaultFrom,
      to: options.to,
      templateId: options.templateId,
      dynamicTemplateData: options.dynamicTemplateData,
    });
  }
}
