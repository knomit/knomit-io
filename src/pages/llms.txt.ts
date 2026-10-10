import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  const origin = site!.origin;

  // Curated marketing routes, in the order we want an LLM to read them.
  const marketing: { title: string; path: string; note: string }[] = [
    { title: 'How knomit works (concepts)', path: '/concepts/', note: 'Facts, ontology, provenance, consensus, temporal graph' },
    { title: 'Use cases', path: '/use-cases/', note: 'Research and analysis corpora, team knowledge, coordinated work across machines, codebases, OKF publishing' },
    { title: 'Comparison', path: '/compare/', note: 'How a knowledge distillation factory differs from RAG, vector stores, recall layers, graph engines and agent runtimes' },
    { title: 'OKF export', path: '/okf/', note: 'Publish a knowledge base as an Open Knowledge Format repository with knomit-okf' },
    { title: 'Security & privacy', path: '/security/', note: 'Agent identity, signed commits verified at acceptance, mTLS, OAuth, grants, local-first storage' },
    { title: 'Explore a live knowledge base', path: '/explore/', note: 'Browse a real KB — facts, refs, history — in the product UI' },
    { title: 'FAQ', path: '/faq/', note: 'Common questions, answered' },
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
    'knomit is a distributed, decentralized knowledge distillation factory: a fabric that connects many agents and many knowledge bases, so that what any one of them learns is accumulated, distilled and put to use by all of them. Today every agent starts from nothing and forgets what it worked out when the session ends; knomit makes learning a cost paid once across the network instead of once per agent. It is domain-agnostic: a knowledge base can hold facts about a codebase, a market, a supply chain or a research field, and a participant can be a coding agent, a research agent, an analyst or a team.',
  );
  lines.push('');
  lines.push(
    'Accumulate: an agent writes what it learns as a typed fact (kind, type, confidence, ontology path, refs) in a signed git commit on its own branch; instances sync in real time or on an interval, can host each other\'s repositories over mTLS, and reach consensus on main by review or automatic merge; where the repository’s policy says so, conflicting edits are merged field by field, and every settled conflict is recorded on the merge commit. Distill: review prunes duplicates, distills higher-order syntheses and reflects on method; hypotheses extend syntheses into falsifiable predictions; discovery proposes keystone facts nobody wrote down; motifs name the pattern facts about different subjects share. Use: agents query and explain facts over MCP (twelve tools), lenses query several knowledge bases as one, skills ship with a knowledge base, triggers and recipes react to new facts and launch work, experiments stage work on a local branch that commits or rolls back as a unit, and knomit-okf publishes a knowledge base as Open Knowledge Format.',
  );
  lines.push('');
  lines.push(
    'The mechanism is git, used for what its operations mean: a commit is a signed assertion of belief, a branch is an agent\'s identity, a merge is consensus, a conflict is a disagreement surfaced to be settled, and the log is the timeline of what the fabric believed and when. Git is the only source of truth; indexes and embeddings are rebuildable caches. Source-available (FSL-1.1-ALv2); MCP-native.',
  );
  lines.push('');
  lines.push(
    'knomit also publishes to the Open Knowledge Format (OKF), the open specification Google Cloud released in June 2026 for representing knowledge as plain markdown with YAML frontmatter. The knomit-okf CLI exports a knowledge base as a conformant OKF repository from a single git URL and keeps it in sync — rendering deterministically, validating against the spec before it commits, and leaving the push to you. The export is one-way: knomit writes OKF, and does not read it.',
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
