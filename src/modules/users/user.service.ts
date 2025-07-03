import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { User, UserDocument } from './models/user.model';
import { CreateUserDto, LoginUserDto } from './dto/user.dto';
import { DocentiLogger } from 'src/lib/logger';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly logger: DocentiLogger,
  ) {}

  async signup(dto: CreateUserDto): Promise<{ message: string }> {
    try {
      const userCount = this.userModel.countDocuments();
      if (+userCount == 5) {
        this.logger.warn(`Signup attempt failed – user limit reached`);
        throw new BadRequestException('User limit reached');
      }
      this.logger.log(`Signup attempt for ${dto.email}`);
      const existingUser = await this.userModel
        .findOne({ email: dto.email })
        .exec();
      if (existingUser) {
        this.logger.warn(`Signup failed – email exists: ${dto.email}`);
        throw new BadRequestException('Email already registered');
      }

      const newUser = new this.userModel({
        email: dto.email,
        password: dto.password,
        name: dto.name,
      });

      await newUser.save();
      this.logger.log(`User registered: ${dto.email}`);
      return { message: 'User registered successfully' };
    } catch (err) {
      this.logger.error('signup failed', err as Error);
      throw err;
    }
  }

  async login(
    dto: LoginUserDto,
  ): Promise<{ access_token: string; name: string }> {
    try {
      this.logger.log(`Login attempt for ${dto.email}`);
      const user = await this.userModel.findOne({ email: dto.email }).exec();
      if (!user) throw new UnauthorizedException('Invalid credentials');

      const passwordValid = await verify(user.password, dto.password);
      if (!passwordValid) {
        this.logger.warn(`Invalid password for ${dto.email}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.currentSessionId) {
        this.logger.warn(`User already signed in: ${dto.email}`);
        throw new BadRequestException(
          'Already signed in from another device/session',
        );
      }

      const sessionId = randomUUID();
      await this.userModel.updateOne(
        { _id: user._id },
        { isSignedIn: true, currentSessionId: sessionId },
      );

      const payload = {
        sub: user._id.toString(),
        email: user.email,
        mode: 'lecturer' as const,
        sessionId,
      };
      const token = await this.jwtService.signAsync(payload);
      this.logger.log(`User logged in: ${dto.email}`);
      return { access_token: token, name: user.name };
    } catch (err) {
      this.logger.error('login failed', err as Error);
      throw err;
    }
  }

  async logout(id: Types.ObjectId): Promise<{ message: string }> {
    try {
      this.logger.log(`Logging out user ${id.toString()}`);
      await this.userModel.updateOne(
        { _id: id },
        { isSignedIn: false, currentSessionId: null },
      );
      this.logger.log(`User logged out: ${id.toString()}`);
      return { message: 'User logged out' };
    } catch (err) {
      this.logger.error('logout failed', err as Error);
      throw err;
    }
  }
}
