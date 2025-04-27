import * as pdfparse from 'pdf-parse';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

@Injectable()
export class ProcessService {
  private ai: GoogleGenerativeAI;
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
  private readonly model: GenerativeModel;

  constructor() {
    if (!process.env.GEMINI_KEY) {
      throw new Error('GEMINI_KEY must be defined in environment variables.');
    }
    this.ai = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    this.model = this.ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async processPdf(file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('No file provided');
      }
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('Invalid file type: only PDF is allowed');
      }
      const parsedPdf = await pdfparse(file.buffer);
      const extractedText = parsedPdf.text.trim();
      const geminiResponse = await this.model.generateContent([
        this.prompt,
        extractedText,
      ]);
      let raw = geminiResponse.response
        .text()
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      raw = raw
        .split('\n')
        .filter((line) => line.trim() !== ',')
        .join('\n');
      try {
        const json = JSON.parse(raw);
        return json;
      } catch {
        return raw;
      }
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
}
