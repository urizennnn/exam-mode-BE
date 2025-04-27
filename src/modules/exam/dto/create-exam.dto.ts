import {
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ExamAccessType } from '../models/exam.model';

export class GeneralSettingsDto {
  @ApiProperty({ description: 'Whether students are anonymous', example: true })
  @IsNotEmpty()
  anonymous: boolean;

  @ApiProperty({
    description: 'Time limit for the exam (in minutes)',
    example: 60,
  })
  @IsNotEmpty()
  timeLimit: number;
}

export class ExamTypeSettingsDto {
  @ApiProperty({ description: 'Hide points during exam', example: false })
  @IsNotEmpty()
  hidePoints: boolean;

  @ApiProperty({
    description: 'Show results immediately after exam',
    example: true,
  })
  @IsNotEmpty()
  showResults: boolean;
}

export class SettingsDto {
  @ApiProperty({ type: () => GeneralSettingsDto })
  @ValidateNested()
  @Type(() => GeneralSettingsDto)
  general: GeneralSettingsDto;

  @ApiProperty({ type: () => ExamTypeSettingsDto })
  @ValidateNested()
  @Type(() => ExamTypeSettingsDto)
  examType: ExamTypeSettingsDto;
}

export class CreateExamDto {
  @ApiProperty({ description: 'Name of the exam', example: 'English 101' })
  @IsNotEmpty()
  examName: string;

  @ApiProperty({ description: 'Unique key for the exam', example: 'c85444e' })
  @IsNotEmpty()
  examKey: string;

  @ApiProperty({
    enum: ExamAccessType,
    description: 'Access type of the exam',
    example: ExamAccessType.OPEN,
  })
  @IsEnum(ExamAccessType)
  access: ExamAccessType;

  @ApiProperty({
    description: 'File attachment for exam (optional)',
    example: 'examfile.pdf',
    required: false,
  })
  @IsOptional()
  file?: string;

  @ApiProperty({
    description: 'Lecturer ID who created the exam',
    example: '6611ae9459928430fb3cf7b1',
  })
  @IsNotEmpty()
  lecturer: string;

  @ApiProperty({
    description: 'Exam format structure',
    type: [Object],
    example: [{ question: 'What is 2+2?', options: ['2', '4'], answer: '4' }],
  })
  @IsArray()
  format: any[];

  @ApiProperty({ type: () => SettingsDto })
  @ValidateNested()
  @Type(() => SettingsDto)
  settings: SettingsDto;
}
