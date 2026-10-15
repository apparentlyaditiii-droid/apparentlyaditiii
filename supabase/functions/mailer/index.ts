// Sends the emails queued in private.email_outbox: subscription confirmations,
// new-piece announcements and comment notices for Aditi.
//
// Woken by the database (private.kick_mailer, every minute while anything is
// due). Sends through any SMTP account; a Gmail address with an app password
// works without owning a domain.
//
// Secrets (supabase secrets set …):
//   MAILER_SECRET  random string, also stored in Vault as "mailer_secret"
//   SMTP_HOST      smtp.gmail.com
//   SMTP_PORT      465
//   SMTP_USER      the sending address
//   SMTP_PASS      its app password
//   MAIL_FROM      optional, e.g. "Apparently, Aditiii <aditi.sharmaa333@gmail.com>"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import nodemailer from 'npm:nodemailer@6.10.1';

const env = (k: string) => Deno.env.get(k) ?? '';
const SITE = 'Apparently, Aditiii';

type Email = { id: number; kind: 'confirm' | 'new_post' | 'comment'; to_email: string; payload: Record<string, string> };

const transport = nodemailer.createTransport({
  host: env('SMTP_HOST'),
  port: Number(env('SMTP_PORT') || 465),
  secure: Number(env('SMTP_PORT') || 465) === 465,
  auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
});

async function rpc(fn: string, body: unknown) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Plain, letter-like HTML that survives every email client.
function layout(inner: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#221d2a">
<div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #e6dfe9;padding:36px 32px">
<p style="margin:0 0 28px;font-style:italic;font-size:20px;color:#221d2a">Apparently<span style="color:#7b5ea7">,</span> <span style="font-style:normal">Aditiii</span></p>
${inner}
</div>
<p style="max-width:560px;margin:18px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6f6579;text-align:center">${footer}</p>
</body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="display:inline-block;background:#5e4589;color:#fffdf9;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;padding:12px 22px">${esc(label)}</a></p>`;
const para = (html: string) => `<p style="margin:0 0 16px;font-size:17px;line-height:1.6">${html}</p>`;

function compose(e: Email) {
  const p = e.payload;
  if (e.kind === 'confirm') {
    return {
      subject: `Please confirm your subscription to ${SITE}`,
      text: `Hello,\n\nPlease confirm you'd like an email whenever something new is published on ${SITE}:\n${p.confirm_url}\n\nIf you didn't ask for this, ignore this email and nothing will happen.`,
      html: layout(
        para('Hello,') + para(`Please confirm you’d like an email whenever something new is published here.`) +
          button(p.confirm_url, 'Yes, subscribe me') +
          para(`<span style="font-size:14px;color:#554c5f">If you didn’t ask for this, ignore this email and nothing will happen.</span>`),
        'You’re receiving this because this address was entered on the site’s subscribe form.'),
    };
  }
  if (e.kind === 'new_post') {
    return {
      subject: `New on ${SITE}: ${p.title}`,
      text: `${p.title}\n\n${p.excerpt}\n\nRead it: ${p.url}\n\n—\nUnsubscribe: ${p.unsubscribe_url}`,
      html: layout(
        `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7b5ea7">Something new</p>` +
          `<h1 style="margin:0 0 18px;font-weight:400;font-size:30px;line-height:1.15">${esc(p.title)}</h1>` +
          `<p style="margin:0;font-size:18px;line-height:1.6;font-style:italic;color:#554c5f">${esc(p.excerpt)}</p>` +
          button(p.url, 'Read the piece'),
        `You subscribed to new pieces from ${SITE}. <a href="${esc(p.unsubscribe_url)}" style="color:#6f6579">Unsubscribe</a>.`),
      headers: { 'List-Unsubscribe': `<${p.unsubscribe_url}>` },
    };
  }
  return {
    subject: `New comment on “${p.post_title}” from ${p.author_name}`,
    replyTo: p.author_email,
    text: `${p.author_name} <${p.author_email}> commented on "${p.post_title}" (${p.post_url}):\n\n${p.body}\n\nApprove, reject or delete it: ${p.moderate_url}`,
    html: layout(
      para(`<strong>${esc(p.author_name)}</strong> commented on <a href="${esc(p.post_url)}" style="color:#5e4589">${esc(p.post_title)}</a>:`) +
        `<blockquote style="margin:0 0 8px;padding:4px 0 4px 16px;border-left:2px solid #b9a2e0;font-size:17px;line-height:1.6;white-space:pre-wrap">${esc(p.body)}</blockquote>` +
        button(p.moderate_url, 'Review this comment') +
        para(`<span style="font-size:14px;color:#554c5f">It stays hidden until you approve it. Reply to this email to write back to ${esc(p.author_name)}.</span>`),
      'Comment notice from your site.'),
  };
}

Deno.serve(async (req) => {
  if (!env('MAILER_SECRET') || req.headers.get('x-mailer-secret') !== env('MAILER_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const from = env('MAIL_FROM') || `${SITE} <${env('SMTP_USER')}>`;
  const emails = (await rpc('mailer_claim', { p_limit: 40 })) as Email[];
  let sent = 0;
  for (const e of emails) {
    try {
      await transport.sendMail({ from, to: e.to_email, ...compose(e) });
      await rpc('mailer_done', { p_id: e.id, p_error: null });
      sent++;
    } catch (err) {
      await rpc('mailer_done', { p_id: e.id, p_error: String((err as Error)?.message ?? err) });
    }
  }
  return Response.json({ claimed: emails.length, sent });
});
