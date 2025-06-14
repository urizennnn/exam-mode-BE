import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { User, UserDocument } from './models/user.model';
import { CreateUserDto, LoginUserDto } from './dto/user.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: CreateUserDto): Promise<{ message: string }> {
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
  }

  async login(
    dto: LoginUserDto,
  ): Promise<{ access_token: string; name: string }> {
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
  }

  async logout(id: Types.ObjectId): Promise<{ message: string }> {
    this.logger.log(`Logging out user ${id.toString()}`);
    await this.userModel.updateOne(
      { _id: id },
      { isSignedIn: false, currentSessionId: null },
    );
    this.logger.log(`User logged out: ${id.toString()}`);
    return { message: 'User logged out' };
  }
}
