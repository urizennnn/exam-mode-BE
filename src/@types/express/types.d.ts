import 'express';
import { User, UserDocument } from 'src/modules/users/models/user.model';

declare module 'express' {
  export interface Request {
    user?: UserDocument;
  }
}
