import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DocentiLogger } from './logger';

@Injectable()
export class WorkkapMiddlewareLogger implements NestMiddleware {
  constructor(private readonly logger: DocentiLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { method, url } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      const logMessage = `${method} ${url} - ${statusCode} - ${duration}ms`;

      if (!this.logger) {
        console.log(logMessage);
        return;
      }

      if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.info(logMessage);
      }
    });

    next();
  }
}
