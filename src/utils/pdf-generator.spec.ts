import { generateTranscriptPdf } from './pdf-generator';
import * as path from 'path';
import * as os from 'os';
import { readFile, unlink } from 'node:fs/promises';

describe('generateTranscriptPdf', () => {
  it('creates a pdf file from html', async () => {
    const html = '<html><body><h1>Test PDF</h1></body></html>';
    const outPath = path.join(os.tmpdir(), `test-${Date.now()}.pdf`);
    await generateTranscriptPdf(html, outPath);
    const buf = await readFile(outPath);
    expect(buf.length).toBeGreaterThan(0);
    await unlink(outPath);
  });
});
