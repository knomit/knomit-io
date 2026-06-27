import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const origin = site!.origin;
  const docs = (await getCollection('docs')).sort((a, b) => a.id.localeCompare(b.id));
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  const out: string[] = ['# knomit — full text', ''];

  for (const d of docs) {
    out.push(`\n\n---\n# ${d.data.title ?? d.id}`);
    out.push(`Source: ${origin}/${d.id}/`);
    out.push('');
    out.push(d.body ?? '');
  }
  for (const p of posts) {
    out.push(`\n\n---\n# ${p.data.title}`);
    out.push(`Source: ${origin}/blog/${p.id}/`);
    out.push('');
    out.push(p.body ?? '');
  }

  return new Response(out.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
