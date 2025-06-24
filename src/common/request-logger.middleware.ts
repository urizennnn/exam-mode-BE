import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as morgan from 'morgan';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly morganMiddleware = morgan('dev');

  use(req: Request, res: Response, next: NextFunction) {
    this.morganMiddleware(req, res, next);
  }
}
