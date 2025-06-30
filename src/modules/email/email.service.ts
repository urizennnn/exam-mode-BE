import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailClient } from 'zeptomail';
import { TracingService } from 'src/lib/tracing';

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
  private readonly client: SendMailClient;
  private readonly tracing = new TracingService();

  constructor(private readonly cfg: ConfigService) {
    const url = this.cfg.get<string>('ZEPTO_URL') ?? 'api.zeptomail.com/';
    const token = this.cfg.get<string>('ZEPTO_TOKEN') ?? '';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.client = new SendMailClient({
      url,
      token,
    }) as unknown as SendMailClient;
    this.defaultFrom =
      this.cfg.get<string>('ZEPTO_FROM') ?? 'no-reply@example.com';
  }

  async send(options: MailSendOptions) {
    try {
      const to = Array.isArray(options.to) ? options.to : [options.to];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const response = await (this.client as unknown as any).sendMail({
        from: {
          address: options.from ?? this.defaultFrom,
          name: options.from ?? this.defaultFrom,
        },
        to: to.map((address) => ({
          email_address: {
            address,
            name: address,
          },
        })),
        subject: options.subject,
        textbody: options.text ?? '',
        htmlbody: options.html,
      });
      this.logger.debug(`Email sent: ${JSON.stringify(response)}`);
    } catch (err: unknown) {
      this.logger.error(`Error sending mail: ${err as string}`);
      this.tracing.captureException(err);
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Failed to send mail');
    }
  }
}
