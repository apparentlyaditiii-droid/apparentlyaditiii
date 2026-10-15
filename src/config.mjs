// Site-wide settings. The Supabase publishable key is designed to be public
// (Row Level Security decides what it can do), so it's safe to commit and
// ship to browsers. Environment variables override these for other projects.

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const config = {
  siteUrl: (process.env.SITE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:4321')).replace(/\/$/, ''),
  supabaseUrl: process.env.SUPABASE_URL || 'https://kpawyicwisdgthdpwooz.supabase.co',
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ln0ahNgZdpdx7a6E8Zn1rQ_jkLsqZ30',
  // Vercel's /_vercel/image resizer only exists on deployments.
  optimizeImages: Boolean(process.env.VERCEL),

  title: 'Apparently, Aditiii',
  tagline: "A personal archive of thoughts, feelings, and moments that didn't always ask to be shared.",
  author: 'Aditi',
  authorBio: 'Writes things down so they stop circling. Poems, reflections and unsent notes, in English, Hindi, and somewhere in between.',
  authorPhoto: '/images/aditi.jpg',
  authorPhotoAlt: 'Aditi, smiling in sunglasses, against a hillside of moss and wild grass',
  email: 'aditi.sharmaa333@gmail.com',
  timeZone: 'Asia/Kolkata',
  locale: 'en-IN',
};
