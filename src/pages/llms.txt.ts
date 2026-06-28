import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  const origin = site!.origin;

  // Curated marketing routes, in the order we want an LLM to read them.
  const marketing: { title: string; path: string; note: string }[] = [
    { title: 'How knomit works (concepts)', path: '/concepts', note: 'Facts, ontology, provenance, consensus, temporal graph' },
    { title: 'Use cases', path: '/use-cases', note: 'What you can build on a fact-based, git-native KB' },
    { title: 'Comparison', path: '/compare', note: 'knomit vs RAG, vector DBs, and agent-memory tools' },
    { title: 'FAQ', path: '/faq', note: 'Common questions, answered' },
  ];

  const docs = (await getCollection('docs')).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  const lines: string[] = [];
  lines.push('# knomit');
  lines.push('');
  lines.push(`> ${SITE_DESCRIPTION}`);
  lines.push('');
  lines.push(
    'knomit is git-backed knowledge for AI agents: a distributed, decentralized knowledge base built from concise, typed facts — not documents. Each fact carries a kind (epistemic or pragmatic), a confidence, an ontology path, and signed-commit provenance. Peers learn on their own branches and converge on a shared main. Open source; MCP-native.',
  );
  lines.push('');

  lines.push('## Start');
  for (const m of marketing) {
    lines.push(`- [${m.title}](${origin}${m.path}): ${m.note}`);
  }
  lines.push('');

  lines.push('## Docs');
  for (const d of docs) {
    const title = d.data.title ?? d.id;
    const desc = (d.data as { description?: string }).description ?? '';
    lines.push(`- [${title}](${origin}/${d.id}/)${desc ? `: ${desc}` : ''}`);
  }
  lines.push('');

  lines.push('## Blog');
  for (const p of posts) {
    lines.push(`- [${p.data.title}](${origin}/blog/${p.id}/): ${p.data.description}`);
  }
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
