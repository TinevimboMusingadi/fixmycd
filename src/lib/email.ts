import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  if (!resend) {
    console.warn('⚠️ RESEND_API_KEY not set — skipping email');
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    return true;
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}

export async function sendCommentNotification({
  to,
  reportTitle,
  reportId,
  commenterName,
  commentBody,
}: {
  to: string;
  reportTitle: string;
  reportId: string;
  commenterName: string;
  commentBody: string;
}): Promise<boolean> {
  const url = `${BASE_URL}/dashboard/reports/${reportId}`;
  return sendEmail({
    to,
    subject: `New comment on "${reportTitle}"`,
    html: `
      <h2>New comment on your report</h2>
      <p><strong>${commenterName}</strong> commented on <strong>${reportTitle}</strong>:</p>
      <blockquote style="border-left: 3px solid #8b5cf6; padding-left: 12px; color: #555;">
        ${commentBody}
      </blockquote>
      <p><a href="${url}" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Report</a></p>
      <p style="color: #888; font-size: 12px;">You can turn off email notifications in your profile settings.</p>
    `,
  });
}

export async function sendUpvoteNotification({
  to,
  reportTitle,
  reportId,
  upvoteCount,
}: {
  to: string;
  reportTitle: string;
  reportId: string;
  upvoteCount: number;
}): Promise<boolean> {
  const url = `${BASE_URL}/dashboard/reports/${reportId}`;
  return sendEmail({
    to,
    subject: `Your report "${reportTitle}" got an upvote`,
    html: `
      <h2>Someone upvoted your report</h2>
      <p>Your report <strong>${reportTitle}</strong> now has <strong>${upvoteCount}</strong> upvote(s).</p>
      <p><a href="${url}" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Report</a></p>
    `,
  });
}

export async function sendStatusChangeNotification({
  to,
  reportTitle,
  reportId,
  newStatus,
}: {
  to: string;
  reportTitle: string;
  reportId: string;
  newStatus: string;
}): Promise<boolean> {
  const url = `${BASE_URL}/dashboard/reports/${reportId}`;
  return sendEmail({
    to,
    subject: `Your report "${reportTitle}" status changed`,
    html: `
      <h2>Your report status has changed</h2>
      <p>Your report <strong>${reportTitle}</strong> is now: <strong>${newStatus.replace(/_/g, ' ')}</strong>.</p>
      <p><a href="${url}" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Report</a></p>
    `,
  });
}

export async function sendBetaReleaseNotification({
  to,
}: {
  to: string;
}): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'FixMyDistrict is now open!',
    html: `
      <h2>FixMyDistrict is now open!</h2>
      <p>Thanks for your interest. The platform is now live and you can create your account.</p>
      <p><a href="${BASE_URL}/signup" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Sign Up</a></p>
    `,
  });
}