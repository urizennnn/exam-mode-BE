import * as pdfparse from 'pdf-parse';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import * as path from 'path';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { generateTranscriptPdf } from 'src/utils/pdf-generator';
import { PDF_QUEUE, ParseJobData, MarkJobData } from 'src/utils/constants';
import { Exam, ExamDocument } from '../exam/models/exam.model';
import { PdfQueueProducer } from 'src/lib/queue/queue.producer';
import { Submissions, ParsedQuestion } from '../exam/interfaces/exam.interface';
import { AwsService } from 'src/lib/aws/aws.service';
import { DocentiLogger } from 'src/lib/logger';

interface JobInfo {
  id: string;
  name: string;
  state: string;
  progress: any;
  attemptsMade: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  result: unknown;
  failedReason: string | null;
}

@Injectable()
export class ProcessService {
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_KEY!);
  private readonly model: GenerativeModel = this.ai.getGenerativeModel({
    model: 'gemini-2.0-flash',
  });

  private readonly originalWarn = console.warn;

  // NOTE: DO NOT CHANGE THESE PROMPTS WITHOUT TESTING!
  private readonly markPrompt =
    `You are an exam PDF parser. You'll receive raw extracted text containing exam questions, the correct answers, and a student's responses. Your task:
1. Identify every question.
2. Compare the student's answer to the correct answer for each.
3. Calculate the total correct responses.
4. Return ONLY the result as a fraction in the form X/Y, where Y is the total number of questions.
5. Do not include any additional text, explanations, or formatting.
6. Do not mark theory questions; only multiple-choice questions are scored.
Do not include any other text or explanation.`.trim();

  private readonly parsePrompt =
    `You are an exam PDF parser receiving raw extracted PDF text. Return a JSON array. Each element MUST be an object with:
{
  "type": "multiple-choice" | "theory",
  "question": "<exact question text>",
  "options": ["<option 1>", "<option 2>", ...],
  "answer": "<exact answer text>"
}
Rules:
- Detect the question type accurately.
- Do NOT paraphrase or modify any part of the question, options, or answer.
- For theory questions, never invent answers; include "answer" only when it appears verbatim in the source.
- Remove any leading or trailing whitespace from all text.
- Remove duplicate options if shown in the source.
- If no questions are present, return an empty array.
  Return ONLY the JSON array—no markdown fences, no extra text.`.trim();

  private filterWarn(...msg: unknown[]) {
    const m = String(msg[0]);
    if (m.includes('FormatError') || m.includes('Indexing all PDF objects')) {
      return;
    }
    this.originalWarn(...msg);
  }

  private commandExists(cmd: string): boolean {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private installPdftotext() {
    try {
      this.logger.warn('Attempting to install pdftotext via apt-get');
      execFileSync('apt-get', ['update'], { stdio: 'ignore' });
      execFileSync('apt-get', ['install', '-y', 'poppler-utils'], {
        stdio: 'ignore',
      });
    } catch (e) {
      this.logger.error(`Failed to install pdftotext: ${e}`);
    }
  }

  private ensurePdftotext() {
    if (!this.commandExists('pdftotext')) {
      this.installPdftotext();
      if (!this.commandExists('pdftotext')) {
        this.logger.error('pdftotext command not found');
        throw new InternalServerErrorException(
          'pdftotext command not found. Install the "poppler-utils" package.',
        );
      }
    }
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (console as { warn: (...args: unknown[]) => void }).warn =
        this.filterWarn.bind(this);
      try {
        const { text } = (await pdfparse(buffer)) as { text: string };
        if (text.trim()) {
          return text;
        }
      } catch (err) {
        this.logger.warn(
          `pdf-parse attempt ${attempt} failed: ${(err as Error).message}`,
        );
      } finally {
        console.warn = this.originalWarn;
      }
      await sleep(300 * attempt);
    }

    this.ensurePdftotext();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const stdout = execFileSync(
          'pdftotext',
          ['-q', '-enc', 'UTF-8', '-layout', '-', '-'],
          { input: buffer },
        );
        const text = stdout.toString('utf8');
        if (text.trim()) {
          return text;
        }
      } catch (err) {
        this.logger.warn(
          `pdftotext attempt ${attempt} failed: ${(err as Error).message}`,
        );
      }
      await sleep(300 * attempt);
    }
    return '';
  }

  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    private readonly producer: PdfQueueProducer,
    @InjectQueue(PDF_QUEUE)
    private readonly queue: Queue<ParseJobData | MarkJobData, string>,
    private readonly aws: AwsService,
    private readonly logger: DocentiLogger,
  ) {}

  async enqueueProcessPdf(file: Express.Multer.File, examKey: string) {
    try {
      this.validateFile(file);
      this.ensurePdftotext();
      const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
      await writeFile(tmpPath, file.buffer);
      const job = await this.producer.enqueueProcess({ tmpPath, examKey });
      this.logger.verbose(
        `Queued parse job ${job.id} for ${file.originalname}`,
      );
      return { jobId: job.id };
    } catch (e) {
      this.logger.error(`Error queueing parse job: ${String(e)}`);
      throw e;
    }
  }

  async enqueueMarkPdf(
    file: Express.Multer.File,
    examKey: string,
    email: string,
    studentAnswer: string,
    timeSpent: number,
  ) {
    try {
      this.validateFile(file);
      this.ensurePdftotext();
      if (!(await this.examModel.exists({ examKey })))
        throw new BadRequestException('Exam not found');
      const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
      await writeFile(tmpPath, file.buffer);
      const job = await this.producer.enqueueMark({
        tmpPath,
        examKey,
        email,
        studentAnswer,
        timeSpent,
      });
      this.logger.verbose(
        `Queued mark job ${job.id} for exam ${examKey} – ${email}`,
      );
      return {
        jobId: job.id,
        message: 'Exam marking job queued successfully',
      };
    } catch (e) {
      this.logger.error(`Error in enqueueMarkPdf: ${JSON.stringify(e)}`);
      throw new BadRequestException(
        `Error processing PDF: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async getJobInfo(id: string): Promise<JobInfo> {
    const job = (await this.queue.getJob(id)) as Job<
      unknown,
      unknown,
      string
    > | null;
    if (!job) throw new NotFoundException('Job not found');

    const state = await job.getState();
    const info: JobInfo = {
      id: job.id!,
      name: job.name,
      state,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      result: job.returnvalue,
      failedReason: job.failedReason ?? null,
    };
    this.logger.debug(`Job ${id} state: ${state}`);
    return info;
  }

  async parsePdfWorker(job: Job<ParseJobData>): Promise<unknown> {
    const { tmpPath, examKey } = job.data;
    this.logger.debug(`Processing parse worker for ${tmpPath}`);
    try {
      const buffer = await readFile(tmpPath);
      const extracted = (await this.extractTextFromPdf(buffer)).trim();
      if (!extracted) throw new BadRequestException('No text found in PDF');
      const raw = await this.aiGenerateWithRetry([
        this.parsePrompt,
        extracted,
      ]).then((t) =>
        t
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim()
          .split('\n')
          .filter((l) => l.trim() !== ',')
          .join('\n'),
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        this.logger.warn(
          `AI returned non-JSON output for ${tmpPath}; returning raw`,
        );
        parsed = raw;
      }

      if (examKey) {
        const exam = await this.examModel.findOne({ examKey }).exec();
        if (exam) {
          this.logger.debug(`Updating exam ${examKey} with parsed questions`);
          const arr = (
            Array.isArray(parsed) ? parsed : [parsed]
          ) as ParsedQuestion[];
          exam.question_text = arr;
          await exam.save();
        }
      }

      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error in parsePdfWorker: ${JSON.stringify(msg)}`);
      throw e;
    } finally {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade >= attempts - 1) {
        await unlink(tmpPath);
      } else {
        this.logger.debug(`Retaining ${tmpPath} for retry`);
      }
    }
  }

  async markPdfWorker(data: MarkJobData): Promise<string> {
    this.logger.debug(`Processing mark worker for job file ${data.tmpPath}`);
    try {
      return await this.performMark(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error in markPdfWorker: ${JSON.stringify(msg)}`);
      throw new BadRequestException(`Error processing PDF: ${msg}`);
    }
  }

  private async performMark(data: MarkJobData): Promise<string> {
    try {
      const { tmpPath, examKey, email, studentAnswer, timeSpent } = data;
      const exam = await this.examModel.findOne({ examKey }).exec();
      if (!exam) throw new NotFoundException('Exam not found');
      const studenName = exam.invites.find((i) => i.email === email)?.name;
      const buffer = await readFile(tmpPath);
      const extracted = (await this.extractTextFromPdf(buffer)).trim();
      if (!extracted) throw new BadRequestException('No text found in PDF');

      const scoreText = await this.generateScoreText(extracted);

      const pdfBytes = await this.createTranscriptPdf(
        buffer,
        scoreText,
        examKey,
        email,
        studenName,
        timeSpent,
        exam.question_text,
        studentAnswer,
      );
      const transcriptUrl = await this.uploadTranscript(
        `transcript-${examKey}-${email}.pdf`,
        pdfBytes,
      );

      const submission: Submissions = {
        email: email.toLowerCase(),
        studentAnswer,
        score: parseInt(scoreText.split('/')[0], 10),
        transcript: transcriptUrl,
        timeSubmitted: new Date().toISOString(),
        timeSpent,
      };
      this.upsertSubmission(exam, submission);
      await exam.save();
      await unlink(tmpPath);

      this.logger.log(`Mark worker completed for ${tmpPath}`);
      return scoreText;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`Error in performMark: ${JSON.stringify(err.message)}`);
      this.logger.error(`Error details: ${JSON.stringify(err.stack)}`);
      throw new BadRequestException(`Error processing PDF: ${err.message}`);
    }
  }

  private async generateScoreText(text: string): Promise<string> {
    const scoreText = (
      await this.aiGenerateWithRetry([this.markPrompt, text])
    ).trim();
    if (!/^\s*\d+\s*\/\s*\d+\s*$/.test(scoreText))
      throw new BadRequestException(`Unexpected score format "${scoreText}"`);
    return scoreText;
  }

  private async createTranscriptPdf(
    _buffer: Buffer,
    scoreText: string,
    examKey: string,
    email: string,
    studenName: string | undefined,
    timeSpent: number,
    questions: ParsedQuestion[],
    studentAnswer: string,
  ): Promise<Buffer> {
    let parsed: any = [];
    try {
      parsed = JSON.parse(studentAnswer);
    } catch {
      parsed = [];
    }

    const normalise = (value: unknown): string =>
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    const buildAliases = (value: unknown): Set<string> => {
      const aliases = new Set<string>();
      if (!value) return aliases;
      const asString = String(value);
      const cleaned = normalise(asString);
      if (cleaned) aliases.add(cleaned);
      const letterMatch = asString.match(/^\s*([A-Z])(?=[).\s])/i);
      if (letterMatch) aliases.add(letterMatch[1].toLowerCase());
      return aliases;
    };

    const asArray = Array.isArray(parsed) ? parsed : [];
    const asRecord =
      parsed && !Array.isArray(parsed) && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};

    const resolveAnswer = (index: number, questionText: string): string => {
      const fromArray = asArray[index];
      if (fromArray !== undefined) {
        if (typeof fromArray === 'string') return fromArray;
        if (
          fromArray &&
          typeof fromArray === 'object' &&
          'answer' in fromArray &&
          typeof (fromArray as { answer?: string }).answer === 'string'
        )
          return (fromArray as { answer?: string }).answer as string;
        if (
          fromArray &&
          typeof fromArray === 'object' &&
          'choice' in fromArray &&
          typeof (fromArray as { choice?: string }).choice === 'string'
        )
          return (fromArray as { choice?: string }).choice as string;
      }

      const fromRecord = asRecord[questionText] ?? asRecord[String(index)] ?? null;
      return typeof fromRecord === 'string' ? fromRecord : '';
    };

    const [scored, total] = scoreText
      .split('/')
      .map((v) => parseFloat(v.replace(/[^0-9.]/g, '')));
    const percentage =
      Number.isFinite(scored) && Number.isFinite(total) && total > 0
        ? Math.round((scored / total) * 100)
        : undefined;

    const docentiSealSvg = `
      <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1d4ed8" />
            <stop offset="100%" stop-color="#0ea5e9" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill="white" stroke="url(#grad)" stroke-width="6" />
        <text x="60" y="54" text-anchor="middle" font-size="26" font-family="'Segoe UI', sans-serif" font-weight="700" fill="#1d4ed8">DOCENTI</text>
        <text x="60" y="78" text-anchor="middle" font-size="14" font-family="'Segoe UI', sans-serif" fill="#1f2937">Academic Board</text>
        <path d="M35 88h50" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" />
      </svg>`;

    const docentiSeal = `data:image/svg+xml;base64,${Buffer.from(docentiSealSvg).toString('base64')}`;

    const answerBlocks = questions
      .map((q, i) => {
        const userAnswer = resolveAnswer(i, q.question);
        const correctAnswer = q.answer ?? '';
        const userAliases = buildAliases(userAnswer);
        const correctAliases = buildAliases(correctAnswer);
        const optionList = (q.options ?? []).map((option, idx) => {
          const optionAliases = buildAliases(option);
          const isUserChoice = [...optionAliases].some((alias) =>
            userAliases.has(alias),
          );
          const isCorrectChoice = [...optionAliases].some((alias) =>
            correctAliases.has(alias),
          );
          const bullet = String.fromCharCode(65 + idx);
          const classes = [
            'option',
            isCorrectChoice ? 'option--correct' : '',
            isUserChoice ? 'option--selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<li class="${classes}"><span class="option__bullet">${bullet}</span><span class="option__text">${option}</span></li>`;
        });

        const hasExactMatch =
          correctAliases.size > 0 &&
          [...correctAliases].some((alias) => userAliases.has(alias));

        const answerSummary = q.options?.length
          ? `
            <div class="qa__answers">
              <div class="qa__answer qa__answer--student">
                <h4>Student Choice</h4>
                <p>${userAnswer || 'N/A'}</p>
              </div>
              <div class="qa__answer qa__answer--correct">
                <h4>Docenti Key</h4>
                <p>${correctAnswer || 'N/A'}</p>
              </div>
            </div>
          `
          : `
            <div class="qa__answers qa__answers--theory">
              <div class="qa__answer qa__answer--student">
                <h4>Student Response</h4>
                <p>${userAnswer || 'N/A'}</p>
              </div>
              <div class="qa__answer qa__answer--correct">
                <h4>Docenti Guidance</h4>
                <p>${correctAnswer || 'N/A'}</p>
              </div>
            </div>
          `;

        return `
          <section class="qa ${hasExactMatch ? 'qa--correct' : 'qa--incorrect'}">
            <header class="qa__header">
              <span class="qa__index">Question ${i + 1}</span>
              <span class="qa__badge ${hasExactMatch ? 'qa__badge--success' : 'qa__badge--alert'}">
                ${hasExactMatch ? 'Correct' : 'Review'}
              </span>
            </header>
            <h3 class="qa__question">${q.question}</h3>
            ${optionList.length ? `<ul class="qa__options">${optionList.join('')}</ul>` : ''}
            ${answerSummary}
          </section>
        `;
      })
      .join('');

    const html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          :root {
            color-scheme: light;
            --primary: #1d4ed8;
            --primary-soft: #dbeafe;
            --success: #16a34a;
            --alert: #f97316;
            --text: #0f172a;
            --muted: #475569;
            --border: #e2e8f0;
            --bg: #f8fafc;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
          }

          .page {
            background: white;
            border-radius: 18px;
            padding: 32px;
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.07);
            border: 1px solid var(--border);
          }

          .page__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 24px;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
          }

          .brand__seal {
            width: 80px;
            height: 80px;
          }

          .brand__title {
            margin: 0;
            font-size: 32px;
            line-height: 1.2;
            font-weight: 700;
            color: var(--primary);
          }

          .brand__subtitle {
            margin: 4px 0 0;
            color: var(--muted);
            font-size: 15px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }

          .scorecard {
            padding: 20px 24px;
            border-radius: 16px;
            background: var(--primary-soft);
            color: var(--primary);
            min-width: 180px;
          }

          .scorecard__label {
            margin: 0;
            font-size: 13px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .scorecard__value {
            margin: 8px 0 0;
            font-size: 28px;
            font-weight: 700;
          }

          .scorecard__progress {
            margin-top: 12px;
            width: 100%;
            height: 8px;
            border-radius: 999px;
            background: rgba(29, 78, 216, 0.18);
            overflow: hidden;
          }

          .scorecard__progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #1d4ed8, #0ea5e9);
            width: ${percentage ? `${Math.min(percentage, 100)}%` : '0%'};
          }

          .meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin: 28px 0 36px;
            padding: 24px;
            border: 1px solid var(--border);
            border-radius: 16px;
            background: rgba(241, 245, 249, 0.6);
          }

          .meta__item {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .meta__label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
          }

          .meta__value {
            font-size: 16px;
            font-weight: 600;
            color: var(--text);
          }

          .qa + .qa {
            margin-top: 20px;
          }

          .qa {
            padding: 24px;
            border-radius: 18px;
            border: 1px solid var(--border);
            background: white;
            box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
          }

          .qa--correct {
            border-color: rgba(22, 163, 74, 0.4);
          }

          .qa--incorrect {
            border-color: rgba(249, 115, 22, 0.35);
          }

          .qa__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .qa__index {
            font-size: 14px;
            font-weight: 600;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .qa__badge {
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.05em;
          }

          .qa__badge--success {
            background: rgba(22, 163, 74, 0.12);
            color: var(--success);
          }

          .qa__badge--alert {
            background: rgba(249, 115, 22, 0.12);
            color: var(--alert);
          }

          .qa__question {
            margin: 0 0 18px;
            font-size: 18px;
            line-height: 1.5;
            color: var(--text);
          }

          .qa__options {
            list-style: none;
            margin: 0 0 18px;
            padding: 0;
            display: grid;
            gap: 10px;
          }

          .option {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid transparent;
            background: rgba(226, 232, 240, 0.45);
          }

          .option__bullet {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            font-weight: 600;
            background: rgba(15, 23, 42, 0.06);
            color: var(--muted);
          }

          .option__text {
            flex: 1;
            font-size: 15px;
            color: var(--text);
          }

          .option--selected {
            border-color: rgba(29, 78, 216, 0.35);
            background: rgba(219, 234, 254, 0.8);
          }

          .option--correct {
            border-color: rgba(22, 163, 74, 0.4);
            background: rgba(220, 252, 231, 0.6);
          }

          .qa__answers {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          }

          .qa__answers--theory {
            grid-template-columns: 1fr;
          }

          .qa__answer {
            border-radius: 14px;
            border: 1px solid var(--border);
            padding: 16px;
            background: rgba(248, 250, 252, 0.9);
          }

          .qa__answer h4 {
            margin: 0 0 8px;
            font-size: 14px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }

          .qa__answer p {
            margin: 0;
            color: var(--text);
            font-size: 15px;
            line-height: 1.5;
            white-space: pre-wrap;
          }

          footer {
            margin-top: 36px;
            text-align: center;
            font-size: 13px;
            color: var(--muted);
          }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="page__header">
            <div class="brand">
              <img class="brand__seal" src="${docentiSeal}" alt="Docenti Academy Seal" />
              <div>
                <h1 class="brand__title">Docenti Academy</h1>
                <p class="brand__subtitle">Scholastic Evaluation Transcript</p>
              </div>
            </div>
            <aside class="scorecard">
              <p class="scorecard__label">Final Score</p>
              <p class="scorecard__value">${scoreText}</p>
              <div class="scorecard__progress">
                <span class="scorecard__progress-bar"></span>
              </div>
            </aside>
          </section>

          <section class="meta">
            <article class="meta__item">
              <span class="meta__label">Student Name</span>
              <span class="meta__value">${studenName ?? 'Docenti Student'}</span>
            </article>
            <article class="meta__item">
              <span class="meta__label">Student Email</span>
              <span class="meta__value">${email}</span>
            </article>
            <article class="meta__item">
              <span class="meta__label">Exam Key</span>
              <span class="meta__value">${examKey}</span>
            </article>
            <article class="meta__item">
              <span class="meta__label">Date Issued</span>
              <span class="meta__value">${new Date().toLocaleDateString('en-GB')}</span>
            </article>
            <article class="meta__item">
              <span class="meta__label">Time Spent</span>
              <span class="meta__value">${timeSpent ?? 0} seconds</span>
            </article>
            ${percentage !== undefined
              ? `<article class="meta__item"><span class="meta__label">Performance</span><span class="meta__value">${percentage}%</span></article>`
              : ''}
          </section>

          ${answerBlocks}

          <footer>
            This transcript was auto-generated by Docenti for academic record keeping.
          </footer>
        </main>
      </body>
      </html>`;

    const tmpPath = path.join(process.cwd(), `transcript-${Date.now()}.pdf`);
    await generateTranscriptPdf(html, tmpPath);
    const out = await readFile(tmpPath);
    await unlink(tmpPath);
    return out;
  }

  private async uploadTranscript(
    filename: string,
    buffer: Buffer,
  ): Promise<string> {
    const { secure_url } = await this.aws.uploadFile(filename, buffer);
    return secure_url;
  }

  private upsertSubmission(exam: ExamDocument, submission: Submissions) {
    const idx = exam.submissions.findIndex((s) => s.email === submission.email);
    if (idx >= 0) exam.submissions[idx] = submission;
    else exam.submissions.push(submission);
  }

  private async aiGenerateWithRetry(
    msgs: string[],
    attempt = 1,
  ): Promise<string> {
    try {
      const res = await this.model.generateContent(msgs);
      return res.response.text();
    } catch (err) {
      this.logger.warn(`AI fail x${attempt}: ${(err as Error).message}`);
      if (attempt >= 3) throw err;
      await sleep(500 * attempt);
      return this.aiGenerateWithRetry(msgs, attempt + 1);
    }
  }

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Invalid file type – PDF only');
  }
}
