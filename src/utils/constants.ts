export const PDF_QUEUE = 'pdf-processing';
export const EXAM_SCHEDULER_QUEUE = 'exam-scheduler';

export enum PdfJobs {
  PROCESS = 'process-pdf',
  MARK = 'mark-pdf',
}

export interface ParseJobData {
  tmpPath: string;
  examKey: string;
}

export interface MarkJobData extends ParseJobData {
  examKey: string;
  email: string;
  studentAnswer: string;
}
