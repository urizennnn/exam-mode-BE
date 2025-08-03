import { BaseModel } from 'src/utils';

export interface IUser extends BaseModel {
  email: string;
  password: string;
  name: string;
  isSignedIn?: boolean;
  role: import('../models/user.model').UserRole;
  sessionId?: string | null;
}
