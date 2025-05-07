import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class Invite {
  @ApiProperty({ description: 'An array of emails for invitation' })
  @IsNotEmpty()
  @IsArray()
  emails: string[];
}
