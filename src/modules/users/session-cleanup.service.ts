import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './models/user.model';
import { DocentiLogger } from 'src/lib/logger';

@Injectable()
export class SessionCleanupService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly log: DocentiLogger,
  ) {}


  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    try {
      const oneDayInMs = 24 * 60 * 60 * 1000;
      const threshold = new Date(Date.now() - oneDayInMs);

      const expiredUsers = await this.userModel
        .find({
          currentSessionId: { $ne: null },
          updatedAt: { $lt: threshold },
        })
        .select('_id currentSessionId updatedAt');

      if (expiredUsers.length === 0) {
        this.log.log('No expired sessions found');
        return;
      }

      this.log.log(`Found ${expiredUsers.length} users with expired sessions`);

      const result = await this.userModel.updateMany(
        {
          currentSessionId: { $ne: null },
          updatedAt: { $lt: threshold },
        },
        {
          $unset: { currentSessionId: 1 },
          isSignedIn: false,
        },
      );

      if (result.modifiedCount) {
        this.log.log(
          `Cleared ${result.modifiedCount} expired sessions (JWT expired after 1 day of inactivity)`,
        );
      }
    } catch (err) {
      this.log.error('session cleanup failed', err as Error);
    }
  }
}
