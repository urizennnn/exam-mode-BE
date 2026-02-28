import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/modules/email/email.service';

const cfg = new ConfigService();

export async function sendInvite(
  recipients: { email: string; name: string }[],
  examTitle: string,
  examCode: string,
  examLink: string,
  startDate: string,
) {
  const mailer = new MailService(cfg);

  const errors: { email: string; error: string }[] = [];
  for (const { email, name } of recipients) {
    try {
      await mailer.send({
        to: email,
        subject: `Invitation to write ${examTitle}`,
        html: `<p>Dear ${name},</p>
               <p>You are invited to write the <strong>${examTitle}</strong> exam, which will be available on <strong>${startDate}</strong> to at the discretion of the lecturer.</p>
               <p>To take the exam, follow these steps:</p>
               <ol>
                 <li>Click on the link: <a href="${examLink}">${examLink}</a></li>
                 <li>Login with your email address and the following code: <strong>${examCode}</strong></li>
               </ol>
               <p>Ensure you use the correct email address and code to access the exam.</p>
               <p>Thank you.</p>`,
      });
    } catch (err) {
      errors.push({
        email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Failed to send ${errors.length}/${recipients.length} invite(s): ${errors.map((e) => `${e.email}: ${e.error}`).join('; ')}`,
    );
  }
}
export async function sendTranscript(
  email: string,
  transcriptLink: string,
  examName: string,
) {
  const mailer = new MailService(cfg);
  await mailer.send({
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
