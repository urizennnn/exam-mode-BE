import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

interface MailSendOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html: string;
  from?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly defaultFrom: string;
  private readonly transport: Transporter;

  private buildTransport(): Transporter {
    return nodemailer.createTransport({
      host: process.env.ZOHO_SMTP_HOST,
      port: Number(process.env.ZOHO_SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.ZOHO_USERNAME,
        pass: process.env.ZOHO_APP_PASS,
      },
    });
  }

  constructor(private readonly cfg: ConfigService) {
    this.transport = this.buildTransport();
    this.defaultFrom =
      this.cfg.get<string>('ZOHO_FROM') ?? 'no-reply@example.com';
  }

  async send(options: MailSendOptions) {
    try {
      await this.transport.sendMail({
        from: options.from ?? this.defaultFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (err) {
      this.logger.error(`Error sending mail: ${err}`);
      throw err;
    }
  }
}
