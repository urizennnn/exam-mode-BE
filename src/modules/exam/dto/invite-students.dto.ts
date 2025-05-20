import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';

export class Invite {
  @ApiProperty({ description: 'An array of emails for invitation' })
  @IsOptional()
  @IsArray()
  emails: string[];

  @ApiProperty({ description: 'An array of names for invitation' })
  @IsOptional()
  @IsArray()
  names: string[];
}
