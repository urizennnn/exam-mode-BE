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
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { NEEDS_AUTH } from 'src/common';
import { User, UserDocument } from 'src/modules/users/models/user.model';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

export type JwtPayload = Pick<User & Document, 'email'>;
export interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Injectable()
class JwtGuardUtils {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  isAuthRequired(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(NEEDS_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  getRequest(context: ExecutionContext): AuthenticatedRequest {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request || !request.headers) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    return request;
  }

  extractTokenFromHeader(request: Request): string | undefined {
    if (!request.headers.authorization) return undefined;

    const [type, token] = request.headers.authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  async verifyAndValidateToken(token: string): Promise<JwtPayload> {
    try {
      const payload = (await this.jwtService.verify(token)) as JwtPayload;

      if (!this.isValidPayload(payload)) {
        throw new HttpException(
          'Invalid token payload',
          HttpStatus.UNAUTHORIZED,
        );
      }

      return payload;
    } catch (error) {
      this.handleTokenError(error);
    }
  }

  private isValidPayload(payload: JwtPayload): payload is JwtPayload {
    return (payload && typeof payload === 'object' && payload.email) as boolean;
  }

  private handleTokenError(error: any): never {
    if (error instanceof TokenExpiredError) {
      throw new HttpException('Token has expired', HttpStatus.UNAUTHORIZED);
    }

    if (
      error instanceof Error &&
      (error.message === 'jwt malformed' ||
        error.message === 'invalid signature')
    ) {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }

    throw new HttpException('Authorization failed', HttpStatus.UNAUTHORIZED);
  }
}

@Injectable()
export class JwtGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly utils: JwtGuardUtils;
  private readonly logger = new Logger(JwtGuardUtils.name);

  constructor(
    readonly reflector: Reflector,
    readonly jwtService: JwtService,
    @InjectModel(User.name)
    private readonly Usermodel: Model<User>,
  ) {
    super();
    this.utils = new JwtGuardUtils(reflector, jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.log('Checking JWT guard');
    if (!this.utils.isAuthRequired(context)) {
      return true;
    }

    const request = this.utils.getRequest(context);
    const token = this.utils.extractTokenFromHeader(request);

    if (!token) {
      throw new HttpException(
        'Authentication token is missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload = await this.utils.verifyAndValidateToken(token);
    const user = await this.Usermodel.findOne({ email: payload.email });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }

    request.user = user;
    return true;
  }
}
