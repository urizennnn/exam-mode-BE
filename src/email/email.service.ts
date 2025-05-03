import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class MailerService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT) || 587,
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendMail(
    options: SendMailOptions,
  ): Promise<nodemailer.SentMessageInfo> {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return info;
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to send email: ${err.message}`,
      );
    }
  }
}
