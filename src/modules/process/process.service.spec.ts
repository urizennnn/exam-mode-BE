import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { ExamDocument } from '../exam/models/exam.model';
import { PdfQueueProducer } from 'src/lib/queue/queue.producer';
import { AwsService } from 'src/lib/aws/aws.service';
import { DocentiLogger } from 'src/lib/logger';
import { ParseJobData, MarkJobData } from 'src/utils/constants';
import { ProcessService } from './process.service';
import { ParsedQuestion } from '../exam/interfaces/exam.interface';

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => '' },
      }),
    }),
  })),
}));

describe('ProcessService PDF answer extraction', () => {
  let service: ProcessService;

  beforeAll(() => {
    process.env.GEMINI_KEY = process.env.GEMINI_KEY ?? 'test-key';
  });

  beforeEach(() => {
    service = new ProcessService(
      {} as unknown as Model<ExamDocument>,
      {} as unknown as PdfQueueProducer,
      {} as unknown as Queue<ParseJobData | MarkJobData, string>,
      {
        uploadFile: jest.fn(),
      } as unknown as AwsService,
      {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
      } as unknown as DocentiLogger,
    );
  });

  it('extracts answers from explicit answer labels', () => {
    const questions: ParsedQuestion[] = [
      {
        type: 'multiple-choice',
        question: 'What is 2 + 2?',
        options: ['1', '4', '22'],
        answer: '4',
      },
      {
        type: 'theory',
        question: 'Explain gravity in one sentence.',
      },
    ];

    const pdfText = `
    Question 1) What is 2 + 2?
    A. 1
    B. 4
    C. 22
    Answer: B

    Question 2) Explain gravity in one sentence.
    Answer:
    Gravity pulls objects towards each other.
    `;

    const result = (service as any).extractStudentAnswersFromPdfText(
      pdfText,
      questions,
    ) as Array<{ index: number; answer?: string; choice?: string }>;

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, answer: '4', choice: 'B' }),
        expect.objectContaining({
          index: 1,
          answer: expect.stringContaining('Gravity pulls objects'),
        }),
      ]),
    );
  });

  it('detects checkbox selections for multiple choice questions', () => {
    const questions: ParsedQuestion[] = [
      {
        type: 'multiple-choice',
        question: 'Pick a primary colour.',
        options: ['Red', 'Blue', 'Yellow'],
      },
    ];

    const pdfText = `
    Question 1 - Pick a primary colour.
    [ ] A. Red
    [x] B. Blue
    [ ] C. Yellow
    `;

    const [entry] = (service as any).extractStudentAnswersFromPdfText(
      pdfText,
      questions,
    ) as Array<{ index: number; answer?: string; choice?: string }>;

    expect(entry).toMatchObject({ index: 0, answer: 'Blue', choice: 'B' });
  });
});
