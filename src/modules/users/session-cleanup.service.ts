import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from './models/user.model';

@Injectable()
export class SessionCleanupService {
  private readonly log = new Logger(SessionCleanupService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const expires = this.config.get<string>('JWT_EXPIRES_IN', '1d');
    const ms = this.parseDuration(expires);
    const threshold = new Date(Date.now() - ms);
    const result = await this.userModel.updateMany(
      {
        currentSessionId: { $ne: null },
        updatedAt: { $lt: threshold },
      },
      { isSignedIn: false, currentSessionId: null },
    );
    if (result.modifiedCount) {
      this.log.log(`Cleared ${result.modifiedCount} stale sessions`);
    }
  }

  private parseDuration(str: string): number {
    const match = /^\s*(\d+)([smhd])\s*$/.exec(str);
    if (!match) return 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }
}
