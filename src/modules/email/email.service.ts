import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sg from '@sendgrid/mail';

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
    const apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    this.defaultFrom =
      this.config.get<string>('SENDGRID_FROM') ?? 'no-reply@example.com';
    sg.setApiKey(apiKey);
  }

  async send(options: SendgridSendOptions) {
    try {
      await sg.send({
        from: options.from ?? this.defaultFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (error) {
      this.logger.error(`Error sending email: ${error}`);
      throw error;
    }
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
