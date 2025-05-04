import * as pdfparse from 'pdf-parse';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

async function safeExtract(buffer: Buffer): Promise<string> {
  const { text } = await pdfparse(buffer);
  if (text.trim()) return text;
  const stdout = execFileSync('pdftotext', ['-', '-'], { input: buffer });
  return stdout.toString('utf8');
}

@Injectable()
export class ProcessService {
  private readonly ai: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
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

  constructor() {
    if (!process.env.GEMINI_KEY) {
      throw new Error('GEMINI_KEY must be defined in environment variables.');
    }
    this.ai = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    this.model = this.ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async processPdf(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Invalid file type: only PDF is allowed');
    }
    try {
      const extractedText = (await safeExtract(file.buffer)).trim();
      if (!extractedText)
        throw new BadRequestException('No text found in the PDF');

      const geminiResponse = await this.model.generateContent([
        this.prompt,
        extractedText,
      ]);

      const raw = geminiResponse.response
        .text()
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
        .split('\n')
        .filter((line) => line.trim() !== ',')
        .join('\n');

      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
}
