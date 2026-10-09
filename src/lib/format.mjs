import { marked } from 'marked';
import { config } from '../config.mjs';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const pad2 = (n) => String(n).padStart(2, '0');

export const slugify = (text) =>
  String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const hasDevanagari = (text) => /[ऀ-ॿ]/.test(String(text ?? ''));
export const langOf = (text, fallback = 'en') => (hasDevanagari(text) && !/[a-z]{3}/i.test(text) ? 'hi' : fallback);

// Dates are shown in the author's time zone, wherever the build runs.
function parts(iso) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

export const longDate = (iso) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso));

export const shortDate = (iso) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso));

export const yearOf = (iso) => parts(iso).year;

export function postPath(post) {
  const { year, month, day } = parts(post.published_at);
  return `/${year}/${month}/${day}/${post.slug}/`;
}

export const categoryPath = (slug) => `/category/${slug}/`;
export const tagPath = (tag) => `/tag/${slugify(tag)}/`;
export const absolute = (path) => config.siteUrl + path;

marked.use({ gfm: true, breaks: true });

export function renderContent(content, format) {
  return format === 'html' ? content : marked.parse(content ?? '');
}

export function plainText(html) {
  return String(html ?? '')
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—').replace(/&#8230;|&hellip;/g, '…').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

export function readingMinutes(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function truncate(text, max = 160) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
