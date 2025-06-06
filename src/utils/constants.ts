export const PDF_QUEUE = 'pdf-processing';

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
