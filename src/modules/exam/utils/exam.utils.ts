import { ConfigService } from '@nestjs/config';
import { SendgridService } from 'src/modules/email/email.service';

const cfg = new ConfigService();
export async function sendInvite(
  emails: Array<string>,
  link?: string,
  examName?: string,
) {
  const set = new Set(emails);
  const sg = new SendgridService(cfg);
  const URL: string = cfg.getOrThrow('URL');
  link = `${URL}/student-login`;
  await Promise.all(
    Array.from(set).map((to) =>
      sg.send({
        to,
        subject: `Invitation to take exam: ${examName}`,
        html: `<p>You have been invited to take the exam <strong>${examName}</strong>.</p><p>Please click on this link: <strong>${link}</strong></p>`,
      }),
    ),
  );
}
export function returnEmails(
  file: Express.Multer.File,
  skipHeader = true,
): string[] {
  try {
    const csv = file.buffer.toString('utf8').trim();
    const rows = csv
      .split('\n')
      .map((row) => row.trim())
      .filter((row) => row !== '');

    const dataRows = skipHeader ? rows.slice(1) : rows;

    const emails: string[] = [];
    for (const row of dataRows) {
      const cells = row.split(',').map((cell) => cell.trim());
      if (cells.length < 2) {
        throw new Error(`Row does not have an email column: "${row}"`);
      }
      emails.push(cells[1]);
    }

    return emails;
  } catch (err) {
    console.error('Error parsing CSV for emails:', err);
    throw new Error('Invalid CSV file: cannot extract emails');
  }
}

export function returnNames(
  file: Express.Multer.File,
  skipHeader = true,
): string[] {
  try {
    const csv = file.buffer.toString('utf8').trim();
    const rows = csv
      .split('\n')
      .map((row) => row.trim())
      .filter((row) => row !== '');

    const dataRows = skipHeader ? rows.slice(1) : rows;

    const names: string[] = [];
    for (const row of dataRows) {
      const cells = row.split(',').map((cell) => cell.trim());
      if (cells.length < 1) {
        throw new Error(`Row does not have a name column: "${row}"`);
      }
      names.push(cells[0]);
    }

    return names;
  } catch (err) {
    console.error('Error parsing CSV for names:', err);
    throw new Error('Invalid CSV file: cannot extract names');
  }
}
