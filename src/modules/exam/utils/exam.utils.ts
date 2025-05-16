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
