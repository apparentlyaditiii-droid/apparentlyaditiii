import { config } from '../config.mjs';
import { absolute, esc } from './format.mjs';

// Widths Vercel may resize to; must match "images.sizes" in vercel.json.
export const IMAGE_SIZES = [320, 480, 640, 828, 1080, 1280, 1600];

const isWordPress = (url) => /(^|\.)wordpress\.com\/|wp\.com\//.test(url);

// One resized variant of an image. Site images (/media/…, /images/…) and
// Supabase Storage uploads go through Vercel's image optimizer in production;
// WordPress.com images (only before the media migration) use its ?w= resizer.
export function imageUrl(src, width) {
  if (!src) return src;
  if (isWordPress(src)) return `${src.split('?')[0]}?w=${width}`;
  if (!config.optimizeImages) return src;
  if (src.startsWith('/') || src.startsWith(`${config.supabaseUrl}/storage/v1/object/public/`)) {
    return `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
  }
  return src;
}

export function img(src, { widths = [480, 828, 1280], sizes = '100vw', alt = '', eager = false, cls = '' } = {}) {
  const fallback = imageUrl(src, widths.at(-1));
  const set = fallback === src && !isWordPress(src) ? '' : ` srcset="${widths.map((w) => `${esc(imageUrl(src, w))} ${w}w`).join(', ')}" sizes="${sizes}"`;
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(fallback)}"${set} alt="${esc(alt)}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

// Absolute URL for social previews and RSS.
export const shareImage = (src) => (src ? (src.startsWith('/') ? absolute(imageUrl(src, 1280)) : imageUrl(src, 1280)) : undefined);
