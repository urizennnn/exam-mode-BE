import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailClient } from 'zeptomail';
import { DocentiLogger } from 'src/lib/logger';

interface MailSendOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html: string;
  from?: string;
}

type LoggerLike = {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
};

@Injectable()
export class MailService {
  private readonly defaultFrom: string;
  private readonly client: SendMailClient;
  private readonly logger: LoggerLike;
  constructor(
    private readonly cfg: ConfigService,
    @Optional() logger?: DocentiLogger,
  ) {
    const url = this.cfg.get<string>('ZEPTO_URL') ?? 'api.zeptomail.com/';
    const token = this.cfg.get<string>('ZEPTO_TOKEN') ?? '';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.client = new SendMailClient({
      url,
      token,
    }) as unknown as SendMailClient;
    this.defaultFrom =
      this.cfg.get<string>('ZEPTO_FROM') ?? 'no-reply@example.com';
    this.logger =
      logger ??
      ({
        debug: (message: string, ...args: unknown[]) =>
          console.debug('[MailService]', message, ...args),
        error: (message: string, ...args: unknown[]) =>
          console.error('[MailService]', message, ...args),
      } satisfies LoggerLike);
  }

  async send(options: MailSendOptions) {
    const logger = this.logger ?? console;

    try {
      const to = Array.isArray(options.to) ? options.to : [options.to];

      const response = await this.client.sendMail({
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
      logger.debug(`Email sent: ${JSON.stringify(response)}`);
    } catch (err: unknown) {
      logger.error('Error sending mail', err);
      // if (err instanceof Error) {
      //   throw err;
      // }
      // throw errToLog;
    }
  }
}
