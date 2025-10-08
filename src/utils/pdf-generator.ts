import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

interface TemplateOptions {
  html?: string;
  templatePath?: string;
  data?: Record<string, any>;
}

function compileTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    return value !== undefined ? String(value) : '';
  });
}

export async function renderHtml(options: TemplateOptions): Promise<string> {
  if (options.html) {
    return options.data
      ? compileTemplate(options.html, options.data)
      : options.html;
  }

  if (options.templatePath) {
    const tpl = await readFile(path.resolve(options.templatePath), 'utf8');
    return options.data ? compileTemplate(tpl, options.data) : tpl;
  }

  throw new Error('Either html or templatePath must be provided');
}

export async function generateTranscriptPdf(
  html: string,
  outputPath: string,
): Promise<void> {
  // Use the new headless implementation to avoid deprecation warnings
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });
  try {
    const page = await browser.newPage();
    // Set viewport to ensure consistent rendering
    await page.setViewport({ width: 1200, height: 1600 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' },
      preferCSSPageSize: false,
    });
  } finally {
    await browser.close();
  }
}
