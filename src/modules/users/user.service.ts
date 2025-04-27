import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { verify } from 'argon2';
import { JwtService } from '@nestjs/jwt';
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

  async login(dto: LoginUserDto): Promise<{ access_token: string }> {
    const user = await this.userModel.findOne({ email: dto.email }).exec();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await verify(user.password, dto.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user._id.toString(), email: user.email };
    const token = await this.jwtService.signAsync(payload);

    return { access_token: token };
  }

  async logout(): Promise<{ message: string }> {
    return { message: 'User logged out' };
  }
}
