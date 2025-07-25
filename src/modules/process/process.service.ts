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

    const answerBlocks = questions
      .map((q, i) => {
        const ans = Array.isArray(parsed)
          ? parsed[i]?.answer ?? parsed[i]
          : parsed[q.question] ?? '';
        return `<div class="qa"><p class="question">${i + 1}. ${q.question}</p><p class="choice">Your answer: ${ans || 'N/A'}</p><p class="correct">Correct answer: ${q.answer ?? 'N/A'}</p></div>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: Arial, sans-serif; margin: 1cm; }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .score { font-size: 22px; color: #1a4d99; font-weight: bold; }
        .details { margin-top: 20px; }
        .qa { margin-top: 15px; padding: 10px; border-bottom: 1px solid #ddd; }
        .question { font-weight: 600; }
        .choice { color: #d9534f; }
        .correct { color: #5cb85c; }
      </style>
      </head>
      <body>
        <div class="header">
          <h2>Exam Transcript</h2>
          <div class="score">Score: ${scoreText}</div>
        </div>
        <div class="details">
          <p><strong>Student:</strong> ${email} (${studenName ?? 'N/A'})</p>
          <p><strong>Exam Key:</strong> ${examKey}</p>
          <p><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}</p>
          <p><strong>Time Spent:</strong> ${timeSpent}s</p>
        </div>
        ${answerBlocks}
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
