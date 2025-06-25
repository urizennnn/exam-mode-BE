import * as pdfparse from 'pdf-parse';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PDF_QUEUE, ParseJobData, MarkJobData } from 'src/utils/constants';
import { Exam, ExamDocument } from '../exam/models/exam.model';
import { PdfQueueProducer } from 'src/lib/queue/queue.producer';
import { Submissions } from '../exam/interfaces/exam.interface';

const log = new Logger('ProcessService');

const originalWarn = console.warn;
function filterWarn(...msg: unknown[]) {
  const m = String(msg[0]);
  if (m.includes('FormatError') || m.includes('Indexing all PDF objects'))
    return;
  originalWarn(...msg);
}

async function safeExtract(buffer: Buffer): Promise<string> {
  console.warn = filterWarn;
  try {
    const { text } = await pdfparse(buffer);
    if (text.trim()) return text;
  } catch {
    // ignore
  } finally {
    console.warn = originalWarn;
  }
  const stdout = execFileSync(
    'pdftotext',
    ['-q', '-enc', 'UTF-8', '-layout', '-', '-'],
    { input: buffer },
  );
  return stdout.toString('utf8');
}

@Injectable()
export class ProcessService {
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_KEY!);
  private readonly model: GenerativeModel = this.ai.getGenerativeModel({
    model: 'gemini-2.0-flash',
  });

  // NOTE: DO NOT TOUCH
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
  constructor(
    @InjectModel(Exam.name) private readonly examModel: Model<ExamDocument>,
    private readonly producer: PdfQueueProducer,
    @InjectQueue(PDF_QUEUE)
    private readonly queue: Queue<ParseJobData | MarkJobData, unknown, PdfJobs>,
  ) {}

  async enqueueProcessPdf(file: Express.Multer.File, examKey: string) {
    this.validateFile(file);
    if (!(await this.examModel.exists({ examKey })))
      throw new BadRequestException('Exam not found');
    const tmpPath = `/tmp/${randomUUID()}-${file.originalname}`;
    await writeFile(tmpPath, file.buffer);
    const job = await this.producer.enqueueProcess({ tmpPath, examKey });
    log.verbose(`Queued parse job ${job.id} for ${file.originalname}`);
    return { jobId: job.id };
  }

  async enqueueMarkPdf(
    file: Express.Multer.File,
    examKey: string,
    email: string,
    studentAnswer: string,
  ) {
    this.validateFile(file);
    if (!(await this.examModel.exists({ examKey })))
      throw new BadRequestException('Exam not found');

    const tmpPath = `/tmp/${randomUUID()}-${file.originalname}`;
    await writeFile(tmpPath, file.buffer);

    const job = await this.producer.enqueueMark({
      tmpPath,
      examKey,
      email,
      studentAnswer,
      timeSpent: 0,
    });
    log.verbose(`Queued mark job ${job.id} for exam ${examKey} – ${email}`);
    return {
      jobId: job.id,
      message: 'Exam marking job queued successfully',
    };
  }

  async getJobInfo(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) throw new NotFoundException('Job not found');

    const state = await job.getState();

    const info = {
      id: job.id,
      name: job.name,
      state,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
    log.debug(`Job ${id} state: ${state}`);
    return info;
  }

  async parsePdfWorker({ tmpPath, examKey }: ParseJobData) {
    log.debug(`Processing parse worker for ${tmpPath}`);
    const buffer = await readFile(tmpPath);
    const extracted = (await safeExtract(buffer)).trim();
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

    await unlink(tmpPath);
    try {
      const parsed: unknown = JSON.parse(raw);
      log.debug(`Parse worker completed for ${tmpPath}`);
      if (Array.isArray(parsed)) {
        await this.examModel.updateOne(
          { examKey },
          { question_text: parsed.map((q) => JSON.stringify(q)) },
        );
      }
      return parsed;
    } catch {
      log.warn(`AI returned non-JSON output for ${tmpPath}; returning raw`);
      return raw;
    }
  }

  async markPdfWorker(data: MarkJobData): Promise<string> {
    const { tmpPath, examKey, email, studentAnswer } = data;
    log.debug(`Processing mark worker for job file ${tmpPath}`);
    const exam = await this.examModel.findOne({ examKey }).exec();
    if (!exam) throw new NotFoundException('Exam not found');

    const buffer = await readFile(tmpPath);
    const extracted = (await safeExtract(buffer)).trim();
    if (!extracted) throw new BadRequestException('No text found in PDF');

    const scoreText = (
      await this.aiGenerateWithRetry([this.markPrompt, extracted])
    ).trim();

    if (!/^\s*\d+\s*\/\s*\d+\s*$/.test(scoreText)) {
      throw new BadRequestException(
        `Unexpected score format from AI: ${scoreText}`,
      );
    }

    const submissions: Submissions = {
      email: email.toLowerCase(),
      studentAnswer,
      score: parseInt(scoreText.split('/')[0], 10),
      timeSubmitted: new Date().toISOString(),
      timeSpent: data.timeSpent ?? 0,
    };
    exam.submissions.push(submissions);
    await exam.save();
    await unlink(tmpPath);

    const pdfPath = await this.generateResultPdf(
      exam.examName,
      email,
      scoreText,
    );

    log.debug(`Marked exam ${examKey} for ${email}: ${scoreText}`);
    return pdfPath;
  }

  private async aiGenerateWithRetry(
    msgs: string[],
    attempt = 1,
  ): Promise<string> {
    try {
      const res = await this.model.generateContent(msgs);
      return res.response.text();
    } catch (err: unknown) {
      const message: string = err instanceof Error ? err.message : String(err);
      log.warn(`AI generation failed (attempt ${attempt}): ${message}`);
      if (attempt >= 3) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      await sleep(500 * attempt);
      return this.aiGenerateWithRetry(msgs, attempt + 1);
    }
  }

  private async generateResultPdf(
    examName: string,
    email: string,
    score: string,
  ): Promise<string> {
    const doc = new PDFDocument({ margin: 50 });
    const filePath = `/tmp/result-${randomUUID()}.pdf`;
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    doc
      .fillColor('#2e86de')
      .fontSize(24)
      .text('Exam Result', { align: 'center' });

    doc.moveDown().fillColor('#000').fontSize(18).text(`Exam: ${examName}`);

    doc.moveDown().fontSize(16).text(`Student: ${email}`);
    doc.moveDown().fontSize(16).text(`Score: ${score}`);

    doc
      .moveDown()
      .lineWidth(1)
      .strokeColor('#2e86de')
      .lineTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return filePath;
  }

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Invalid file type: only PDF allowed');
  }
}
