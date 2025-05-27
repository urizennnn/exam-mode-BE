import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { TokenExpiredError } from 'jsonwebtoken';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NEEDS_AUTH } from 'src/common';
import { User } from 'src/modules/users/models/user.model';
import type { Request } from 'express';

export type JwtPayload = {
  email: string;
  mode: 'lecturer' | 'student';
  sub: string;
  sessionId: string;
};

@Injectable()
export class JwtGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requires = this.reflector.getAllAndOverride<boolean>(NEEDS_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requires) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization?.split(' ');
    if (!auth || auth[0] !== 'Bearer') {
      throw new HttpException(
        'Authentication token is missing',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const token = auth[1];

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        const decoded = this.jwtService.decode(token) as JwtPayload | null;
        if (decoded?.email) {
          await this.userModel.updateOne(
            { email: decoded.email },
            { isSignedIn: false, currentSessionId: null },
          );
          this.logger.warn(
            `Token expired – cleared session for ${decoded.email}`,
          );
        }
        throw new HttpException('Token has expired', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userModel.findOne({ email: payload.email }).exec();
    if (!user || user.currentSessionId !== payload.sessionId) {
      throw new HttpException(
        'Session invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    (req as any).user = { id: user._id };
    return true;
  }
}
