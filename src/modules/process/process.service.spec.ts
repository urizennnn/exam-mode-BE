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

  it('remaps presented-order answers back to canonical order before scoring', () => {
    const questions: ParsedQuestion[] = [
      {
        type: 'multiple-choice',
        question: 'Capital of France?',
        options: ['Paris', 'Rome'],
        answer: 'Paris',
      },
      {
        type: 'multiple-choice',
        question: 'What is 2 + 2?',
        options: ['3', '4'],
        answer: '4',
      },
    ];

    const remapped = (service as any).remapAnswersToCanonicalOrder(
      [
        { index: 0, choice: 'B', answer: '4' },
        { index: 1, choice: 'A', answer: 'Paris' },
      ],
      [1, 0],
      questions,
    ) as Array<{ index: number; question?: string; answer?: string; choice?: string }>;

    expect(remapped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          question: 'Capital of France?',
          answer: 'Paris',
          choice: 'A',
        }),
        expect.objectContaining({
          index: 1,
          question: 'What is 2 + 2?',
          answer: '4',
          choice: 'B',
        }),
      ]),
    );

    const evaluated = (service as any).evaluateAnswers(
      questions,
      remapped,
    ) as Array<{ isScorable: boolean; isCorrect: boolean }>;

    expect((service as any).formatScoreText(evaluated)).toBe('2/2');
  });

  it('scores only scorable multiple-choice questions with answer keys', () => {
    const questions: ParsedQuestion[] = [
      {
        type: 'multiple-choice',
        question: 'Pick the even number.',
        options: ['1', '2', '3'],
        answer: '2',
      },
      {
        type: 'theory',
        question: 'Explain your reasoning.',
      },
      {
        type: 'multiple-choice',
        question: 'Question missing key',
        options: ['A', 'B'],
      },
    ];

    const evaluated = (service as any).evaluateAnswers(questions, [
      { index: 0, choice: 'B', answer: '2' },
      { index: 1, answer: 'Because 2 is divisible by 2.' },
      { index: 2, choice: 'A', answer: 'A' },
    ]) as Array<{ isScorable: boolean; isCorrect: boolean }>;

    expect(evaluated.map((entry) => entry.isScorable)).toEqual([
      true,
      false,
      false,
    ]);
    expect((service as any).formatScoreText(evaluated)).toBe('1/1');
  });
});
