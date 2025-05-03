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
import { Model, FilterQuery } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

/* ------------------------------------------------------------------ */
/*  Types and helpers                                                 */
/* ------------------------------------------------------------------ */

export type JwtPayload = Pick<User & Document, 'email'>;

export interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Injectable()
class JwtGuardUtils {
  constructor(
    private readonly reflector: Reflector,
    readonly jwtService: JwtService,
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
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
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
    return !!(payload && typeof payload === 'object' && payload.email);
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

/* ------------------------------------------------------------------ */
/*  Main guard                                                        */
/* ------------------------------------------------------------------ */

@Injectable()
export class JwtGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly utils: JwtGuardUtils;
  private readonly logger = new Logger(JwtGuard.name);

  constructor(
    reflector: Reflector,
    jwtService: JwtService,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {
    super();
    this.utils = new JwtGuardUtils(reflector, jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.log('Checking JWT guard');

    if (!this.utils.isAuthRequired(context)) return true;

    const request = this.utils.getRequest(context);
    const token = this.utils.extractTokenFromHeader(request);

    if (!token) {
      throw new HttpException(
        'Authentication token is missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let payload: JwtPayload;

    try {
      payload = await this.utils.verifyAndValidateToken(token);
    } catch (err) {
      // If token is expired, decode it to obtain the email and reset isSignedIn
      if (err instanceof HttpException && err.message === 'Token has expired') {
        const decoded = this.utils.jwtService.decode(
          token,
        ) as JwtPayload | null;
        if (decoded?.email) {
          const filter: FilterQuery<User> = { email: decoded.email };
          await this.userModel.updateOne(filter, { isSignedIn: false });
          this.logger.warn(
            `JWT expired – reset isSignedIn for ${decoded.email}`,
          );
        }
      }
      throw err; // re-throw so route still gets 401
    }

    const user = await this.userModel.findOne({ email: payload.email });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }

    request.user = user;
    return true;
  }
}
