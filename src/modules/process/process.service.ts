import * as pdfparse from 'pdf-parse';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import 'dotenv/config';

function filterWarn(...msg: unknown[]) {
  const m = String(msg[0]);
  if (m.includes('FormatError') || m.includes('Indexing all PDF objects'))
    return;
  // forward anything else
  originalWarn(...msg);
}
const originalWarn = console.warn;

async function safeExtract(buffer: Buffer): Promise<string> {
  console.warn = filterWarn;
  try {
    const { text } = await pdfparse(buffer);
    if (text.trim()) return text;
  } catch {
    //do nothing
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
  private readonly prompt = `You are an exam PDF parser receiving raw extracted PDF text.
Return a JSON array. Each element MUST be an object with:
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
- If no questions are present, return an empty array.
Return ONLY the JSON array—no markdown fences, no extra text.`;

  async generateWithRetry(text: string, attempt = 1): Promise<string> {
    try {
      const res = await this.model.generateContent([this.prompt, text]);
      return res.response.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(500 * attempt);
      return this.generateWithRetry(text, attempt + 1);
    }
  }

  async processPdf(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Invalid file type: only PDF is allowed');

    const extractedText = (await safeExtract(file.buffer)).trim();
    if (!extractedText)
      throw new BadRequestException('No text found in the PDF');

    let raw: string;
    try {
      raw = (await this.generateWithRetry(extractedText))
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== ',')
        .join('\n');
    } catch (e: any) {
      throw new BadRequestException('AI request failed: ' + e.message);
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
