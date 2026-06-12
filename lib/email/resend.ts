import { Resend } from 'resend';
import 'server-only';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Officers' Mess <onboarding@resend.dev>";

// Palette (kept in sync with the app's design tokens, expressed as hex
// because email clients do not support oklch or CSS variables).
const C = {
  page: '#eef0f3',
  card: '#ffffff',
  border: '#e3e6ea',
  ink: '#10182b',
  body: '#3d4757',
  muted: '#6b7585',
  faint: '#98a1af',
  brass: '#a8843c',
  noteBg: '#f6f7f9',
} as const;

interface SendInvitationEmailOpts {
  email: string;
  fullName?: string;
  inviteLink: string;
  unitName: string;
  role: string;
}

interface SendPasswordResetEmailOpts {
  email: string;
  fullName?: string;
  resetLink: string;
}

interface SendMagicLinkEmailOpts {
  email: string;
  fullName?: string;
  magicLink: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bulletproof CTA button: table-based so it renders in Outlook. */
function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto;">
      <tr>
        <td align="center" bgcolor="${C.ink}" style="border-radius:8px;">
          <a href="${href}" target="_blank"
             style="display:inline-block;padding:14px 40px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

function securityNote(html: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
      <tr>
        <td style="background-color:${C.noteBg};border-left:3px solid ${C.brass};border-radius:0 8px 8px 0;padding:14px 18px;">
          <p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${C.muted};">
            ${html}
          </p>
        </td>
      </tr>
    </table>`;
}

function fallbackLink(href: string): string {
  return `
    <p style="margin:24px 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.faint};">
      If the button doesn&rsquo;t work, copy and paste this link into your browser:<br />
      <a href="${href}" target="_blank" style="color:${C.brass};text-decoration:underline;word-break:break-all;">${href}</a>
    </p>`;
}

/** Key/value rows used for invite details (unit, appointment, etc.). */
function detailRows(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid ${C.border};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${C.faint};white-space:nowrap;">${esc(k)}</td>
        <td style="padding:10px 18px;border-bottom:1px solid ${C.border};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${C.ink};" align="right">${esc(v)}</td>
      </tr>`
    )
    .join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;overflow:hidden;">
      ${tr}
    </table>`;
}

/**
 * Shared transactional email shell. Table-based layout with inline
 * styles only — Gmail, Outlook, and Apple Mail all render it the same.
 */
function getEmailLayout(opts: {
  title: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${esc(opts.title)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .om-container { width: 100% !important; }
      .om-card-pad { padding: 28px 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};-webkit-font-smoothing:antialiased;word-spacing:normal;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.page}">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="om-container" style="width:600px;max-width:600px;">

          <!-- Wordmark -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.ink};">Officers&rsquo;&nbsp;Mess</span>
              <br />
              <span style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${C.faint};">Unit Operations Platform</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td height="4" bgcolor="${C.brass}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td class="om-card-pad" style="padding:40px 44px;">
                    <p style="margin:0 0 6px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.brass};">${esc(opts.eyebrow)}</p>
                    <h1 style="margin:0 0 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;color:${C.ink};">${esc(opts.heading)}</h1>
                    ${opts.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 24px 0;">
              <p style="margin:0 0 6px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.faint};">
                This is an automated transmission from the Officers&rsquo; Mess platform.<br />
                All access and actions are logged and audited for compliance.
              </p>
              <p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${C.faint};">
                &copy; Officers&rsquo; Mess &middot; Authorised personnel only
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${C.body};">${html}</p>`;
}

/**
 * Sends an invite email to a user.
 */
export async function sendInvitationEmail(opts: SendInvitationEmailOpts) {
  const name = opts.fullName || 'Officer';
  const roleLabel =
    opts.role === 'admin'
      ? 'Super Admin'
      : opts.role === 'unit_admin'
        ? 'Unit Administrator'
        : opts.role === 'manager'
          ? 'Manager'
          : 'Member';

  const html = getEmailLayout({
    title: "Your Officers' Mess invitation",
    preheader: `You have been invited to join ${opts.unitName} on the Officers' Mess platform.`,
    eyebrow: 'Official invitation',
    heading: `Join ${opts.unitName}`,
    bodyHtml: `
      ${paragraph(`Dear ${esc(name)},`)}
      ${paragraph(`An administrator has invited you to the <strong>Officers&rsquo; Mess</strong> platform — the system of record for messing, bar accounts, guest rooms, parties and monthly billing in your unit.`)}
      ${detailRows([
        ['Unit', opts.unitName],
        ['Appointment', roleLabel],
        ['Account', opts.email],
      ])}
      ${paragraph(`To activate your account, set your password using the secure button below:`)}
      ${button(opts.inviteLink, 'Set up account')}
      ${securityNote(`<strong>Security notice:</strong> This invitation was initiated by an administrator and carries a one-time credential. It can only be used once and expires after a short period. If you were not expecting it, ignore this email.`)}
      ${fallbackLink(opts.inviteLink)}
    `,
  });

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.email,
    subject: `Invitation to join ${opts.unitName} — Officers' Mess`,
    html,
  });

  if (error) {
    console.error('Resend error sending invitation:', error);
    throw new Error(error.message);
  }
}

/**
 * Sends a password reset email.
 */
export async function sendPasswordResetEmail(opts: SendPasswordResetEmailOpts) {
  const name = opts.fullName || 'Officer';
  const html = getEmailLayout({
    title: "Reset your Officers' Mess password",
    preheader: 'Use this secure one-time link to choose a new password. It expires in 60 minutes.',
    eyebrow: 'Account recovery',
    heading: 'Reset your password',
    bodyHtml: `
      ${paragraph(`Dear ${esc(name)},`)}
      ${paragraph(`We received a request to reset the password for the account <strong>${esc(opts.email)}</strong> on the Officers&rsquo; Mess platform.`)}
      ${paragraph(`If you made this request, choose a new password using the secure button below:`)}
      ${button(opts.resetLink, 'Reset password')}
      ${securityNote(`<strong>Security notice:</strong> If you did not request this, you can safely ignore this email — your current password remains active. This link can only be used once and expires in <strong>60 minutes</strong>.`)}
      ${fallbackLink(opts.resetLink)}
    `,
  });

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.email,
    subject: "Reset your password — Officers' Mess",
    html,
  });

  if (error) {
    console.error('Resend error sending password reset:', error);
    throw new Error(error.message);
  }
}

/**
 * Sends a magic link / passwordless sign-in email.
 */
export async function sendMagicLinkEmail(opts: SendMagicLinkEmailOpts) {
  const name = opts.fullName || 'Officer';
  const html = getEmailLayout({
    title: "Sign in to Officers' Mess",
    preheader: 'Your secure one-time sign-in link. It expires in 60 minutes.',
    eyebrow: 'Passwordless sign-in',
    heading: 'Your sign-in link',
    bodyHtml: `
      ${paragraph(`Dear ${esc(name)},`)}
      ${paragraph(`Use the secure button below to sign in to your Officers&rsquo; Mess account — no password required:`)}
      ${button(opts.magicLink, 'Sign in to dashboard')}
      ${securityNote(`<strong>Security notice:</strong> This link is for one-time use and expires shortly. Do not forward this email — anyone with the link can access your account.`)}
      ${fallbackLink(opts.magicLink)}
    `,
  });

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.email,
    subject: "Your sign-in link — Officers' Mess",
    html,
  });

  if (error) {
    console.error('Resend error sending magic link:', error);
    throw new Error(error.message);
  }
}
