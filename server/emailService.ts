import { Resend } from 'resend';
import { getServerConfig, getSupabaseAdminClient } from './config.ts';

interface SendNotificationEmailInput {
  recipientUserId: string;
  recipientEmail: string;
  eventType: 'reply_to_letter' | 'response_to_reply' | 'moderation_decision' | 'security_event';
  subject: string;
  headline: string;
  messageBody: string;
  actionUrl: string;
  actionLabel: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRestrainedEmailHtml(input: SendNotificationEmailInput): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#F8F7F3;color:#252525;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E8E5DF;border-radius:8px;padding:36px;">
            <tr>
              <td style="border-bottom:1px solid #E8E5DF;padding-bottom:18px;">
                <span style="font-family:Georgia,serif;font-size:22px;color:#252525;letter-spacing:-0.01em;">Dear Stranger</span>
                <p style="margin:4px 0 0;font-size:12px;color:#77736D;">Some things are easier to tell a stranger.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 0 12px;">
                <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#252525;line-height:1.3;">${escapeHtml(input.headline)}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#252525;">${escapeHtml(input.messageBody)}</p>
                <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background-color:#80545A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:500;padding:11px 22px;border-radius:6px;">${escapeHtml(input.actionLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #E8E5DF;padding-top:18px;font-size:12px;line-height:1.6;color:#77736D;">
                <p style="margin:0;">You are receiving this transactional update because email notifications are enabled in your Dear Stranger account settings. We never share your email address with other users.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendTransactionalNotificationEmail(input: SendNotificationEmailInput): Promise<void> {
  const cfg = getServerConfig();
  const admin = getSupabaseAdminClient();

  if (!cfg.resendApiKey) {
    if (admin) {
      await admin.from('email_delivery_logs').insert({
        recipient_user_id: input.recipientUserId,
        event_type: input.eventType,
        provider: 'resend',
        status: 'skipped',
        error_summary: 'RESEND_API_KEY not configured',
      });
    }
    return;
  }

  try {
    const resend = new Resend(cfg.resendApiKey);
    const result = await resend.emails.send({
      from: cfg.resendFromEmail,
      to: input.recipientEmail,
      subject: input.subject,
      html: buildRestrainedEmailHtml(input),
      text: `${input.headline}\n\n${input.messageBody}\n\n${input.actionLabel}: ${input.actionUrl}`,
    });

    if (admin) {
      await admin.from('email_delivery_logs').insert({
        recipient_user_id: input.recipientUserId,
        event_type: input.eventType,
        provider: 'resend',
        provider_message_id: result.data?.id ?? null,
        status: result.error ? 'failed' : 'sent',
        error_summary: result.error ? result.error.message : null,
      });
    }
  } catch (err) {
    if (admin) {
      await admin.from('email_delivery_logs').insert({
        recipient_user_id: input.recipientUserId,
        event_type: input.eventType,
        provider: 'resend',
        status: 'failed',
        error_summary: err instanceof Error ? err.message : 'Unknown delivery error',
      });
    }
  }
}
