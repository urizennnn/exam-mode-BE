import { BaseModel } from 'src/utils';

export interface IUser extends BaseModel {
  email: string;
  password: string;
  name: string;
}
