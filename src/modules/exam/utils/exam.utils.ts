import { ConfigService } from '@nestjs/config';
import { SendgridService } from 'src/modules/email/email.service';

const cfg = new ConfigService();

export async function sendInvite(
  emails: string[],
  link: string | undefined,
  examName: string | undefined,
) {
  const sg = new SendgridService(cfg);
  const URL = cfg.getOrThrow<string>('URL');
  link = `${URL}/student-login`;

  await Promise.all(
    [...new Set(emails)].map((to) =>
      sg.send({
        to,
        subject: `Invitation to take exam: ${examName}`,
        html: `<p>You have been invited to take the exam <strong>${examName}</strong>.</p>
               <p>Please click this link: <strong>${link}</strong></p>`,
      }),
    ),
  );
}

export async function sendTranscript(
  email: string,
  transcriptLink: string,
  examName: string,
) {
  const sg = new SendgridService(cfg);
  await sg.send({
    to: email,
    subject: `Your transcript for ${examName}`,
    html: `<p>Your transcript for <strong>${examName}</strong> is now available.</p>
           <p>View or download it here: <strong>${transcriptLink}</strong></p>`,
  });
}

export function returnEmails(
  file: Express.Multer.File,
  skipHeader = true,
): string[] {
  try {
    const rows = file.buffer
      .toString('utf8')
      .trim()
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    const data = skipHeader ? rows.slice(1) : rows;

    return data.map((row) => {
      const cells = row.split(',').map((c) => c.trim());
      if (cells.length < 2) throw new Error(`Row lacks email column: "${row}"`);
      return cells[1];
    });
  } catch (err) {
    console.error('CSV email parse error:', err);
    throw new Error('Invalid CSV: cannot extract emails');
  }
}

export function returnNames(
  file: Express.Multer.File,
  skipHeader = true,
): string[] {
  try {
    const rows = file.buffer
      .toString('utf8')
      .trim()
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    const data = skipHeader ? rows.slice(1) : rows;

    return data.map((row) => {
      const cells = row.split(',').map((c) => c.trim());
      if (cells.length < 1) throw new Error(`Row lacks name column: "${row}"`);
      return cells[0];
    });
  } catch (err) {
    console.error('CSV name parse error:', err);
    throw new Error('Invalid CSV: cannot extract names');
  }
}
