import pdfparse from 'pdf-parse';
import {
  BadRequestException,
  Injectable,
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
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

  private async safeExtract(buffer: Buffer): Promise<string> {
    console.warn = this.filterWarn.bind(this);
    try {
      const { text } = await pdfparse(buffer);
      if (text.trim()) return text;
    } catch {
      this.logger.warn('PDF parsing failed');
    } finally {
      console.warn = this.originalWarn;
    }
    const stdout = execFileSync(
      'pdftotext',
      ['-q', '-enc', 'UTF-8', '-layout', '-', '-'],
      { input: buffer },
    );
    return stdout.toString('utf8');
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
      const tmpPath = `/tmp/${Date.now()}-${file.originalname}`;
      await writeFile(tmpPath, file.buffer);
      const job = await this.producer.enqueueProcess({ tmpPath, examKey });
      this.logger.verbose(`Queued parse job ${job.id} for ${file.originalname}`);
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
      this.logger.verbose(`Queued mark job ${job.id} for exam ${examKey} – ${email}`);
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

  async parsePdfWorker({ tmpPath, examKey }: ParseJobData): Promise<unknown> {
    this.logger.debug(`Processing parse worker for ${tmpPath}`);
    try {
      const buffer = await readFile(tmpPath);
      const extracted = (await this.safeExtract(buffer)).trim();
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
        this.logger.warn(`AI returned non-JSON output for ${tmpPath}; returning raw`);
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
    } finally {
      await unlink(tmpPath);
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
      const extracted = (await this.safeExtract(buffer)).trim();
      if (!extracted) throw new BadRequestException('No text found in PDF');

      const scoreText = await this.generateScoreText(extracted);

      const pdfBytes = await this.createTranscriptPdf(
        buffer,
        scoreText,
        examKey,
        email,
        studenName,
        timeSpent,
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
    buffer: Buffer,
    scoreText: string,
    examKey: string,
    email: string,
    studenName: string | undefined,
    timeSpent: number,
  ): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const existingPdf = await PDFDocument.load(buffer);
    const newPage = doc.addPage();
    const { width, height } = newPage.getSize();
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const headerFontSize = 14;

    const logoPath = path.resolve('src', 'assets', 'images', 'logo.png');
    const logoBytes = await readFile(logoPath);
    const logoImg = await doc.embedPng(logoBytes);
    const logoScale = 0.4;
    newPage.drawImage(logoImg, {
      x: 50,
      y: height - logoImg.height * logoScale - 50,
      width: logoImg.width * logoScale,
      height: logoImg.height * logoScale,
    });

    const headerText = 'Exam-Module';
    const headerWidth = boldFont.widthOfTextAtSize(headerText, headerFontSize);
    newPage.drawText(headerText, {
      x: (width - headerWidth) / 2,
      y: height - 70,
      size: headerFontSize,
      font: boldFont,
      color: rgb(0.1, 0.3, 0.6),
    });

    const scoreLabel = `Score: ${scoreText}`;
    const scoreWidth = boldFont.widthOfTextAtSize(scoreLabel, headerFontSize);
    newPage.drawText(scoreLabel, {
      x: width - scoreWidth - 50,
      y: height - 70,
      size: headerFontSize,
      font: boldFont,
      color: rgb(0.1, 0.3, 0.6),
    });

    const centerDetails = [
      `Student: ${email} (${studenName})`,
      `Exam Key: ${examKey}`,
      `Time Submitted: ${new Date().toISOString().split('T')[0]}`,
      `Time Spent: ${timeSpent}s`,
    ];
    const yCenterStart = height - 100;
    centerDetails.forEach((line, idx) => {
      const textWidth = regularFont.widthOfTextAtSize(line, fontSize);
      const x = (width - textWidth) / 2;
      newPage.drawText(line, {
        x,
        y: yCenterStart - idx * 20,
        size: fontSize,
        font: regularFont,
        color: rgb(0.2, 0.2, 0.2),
      });
    });

    const dividerY = yCenterStart - centerDetails.length * 20 - 20;

    const contentPages = await doc.embedPages(existingPdf.getPages());
    const contentWidth = width - 100;
    const firstY = dividerY - 40;

    contentPages.forEach((page, idx) => {
      let targetPage = newPage;
      let yPos = firstY;
      if (idx > 0) {
        targetPage = doc.addPage();
        const size = targetPage.getSize();
        yPos = size.height - 50;
      }

      const scale = contentWidth / page.width;
      const scaledHeight = page.height * scale;
      targetPage.drawPage(page, {
        x: 50,
        y: yPos - scaledHeight,
        width: contentWidth,
        height: scaledHeight,
      });
    });

    return Buffer.from(await doc.save());
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
