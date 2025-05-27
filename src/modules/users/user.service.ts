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

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: CreateUserDto): Promise<{ message: string }> {
    const existingUser = await this.userModel
      .findOne({ email: dto.email })
      .exec();
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const newUser = new this.userModel({
      email: dto.email,
      password: dto.password,
      name: dto.name,
    });

    await newUser.save();

    return { message: 'User registered successfully' };
  }

  async login(
    dto: LoginUserDto,
  ): Promise<{ access_token: string; name: string }> {
    const user = await this.userModel.findOne({ email: dto.email }).exec();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await verify(user.password, dto.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    if (user.currentSessionId) {
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

    return { access_token: token, name: user.name };
  }

  async logout(id: Types.ObjectId): Promise<{ message: string }> {
    await this.userModel.updateOne(
      { _id: id },
      { isSignedIn: false, currentSessionId: null },
    );
    return { message: 'User logged out' };
  }
}
