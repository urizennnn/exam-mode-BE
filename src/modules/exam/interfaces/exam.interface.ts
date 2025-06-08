export interface Submissions {
  email: string;
  studentAnswer: string;
  score: number;
  timeSubmitted: string;
  transcript?: string;
}

export interface ParsedQuestion {
  type: 'multiple-choice' | 'theory';
  question: string;
  options?: string[];
  answer?: string;
}
