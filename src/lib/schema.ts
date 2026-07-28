import { SITE_NAME, GITHUB_URL } from './site';

const ctx = 'https://schema.org';

export function organizationSchema(site: URL) {
  return {
    '@context': ctx,
    '@type': 'Organization',
    name: SITE_NAME,
    url: site.origin + '/',
    logo: new URL('/favicon.svg', site).href,
    sameAs: [GITHUB_URL],
  };
}

export function websiteSchema(site: URL) {
  return {
    '@context': ctx,
    '@type': 'WebSite',
    name: SITE_NAME,
    url: site.origin + '/',
  };
}

export function softwareApplicationSchema(site: URL) {
  return {
    '@context': ctx,
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux',
    url: site.origin + '/',
    description:
      'Git-backed knowledge for AI agents: a distributed knowledge base of typed, provenanced facts.',
    featureList: [
      'Typed, atomic facts in plain markdown — not chunked documents',
      'Ed25519-signed git commits with full provenance',
      'Confidence that rises and falls with the evidence',
      'Semantic search over a local embedding model',
      'Synthesis, hypotheses, and emergent discovery',
      'Agent branches with consensus on main',
      'MCP-native tools for Claude Code and any MCP client',
      'REST API (HAL+JSON) and an embedded web UI',
      'Open Knowledge Format (OKF) export',
    ],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: GITHUB_URL,
    isAccessibleForFree: true,
  };
}

export function blogPostingSchema(args: {
  site: URL;
  url: URL;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  image: URL;
}) {
  return {
    '@context': ctx,
    '@type': 'BlogPosting',
    headline: args.title,
    description: args.description,
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    author: { '@type': 'Organization', name: args.author },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: new URL('/favicon.svg', args.site).href },
    },
    image: args.image.href,
    url: args.url.href,
    mainEntityOfPage: { '@type': 'WebPage', '@id': args.url.href },
  };
}

export function breadcrumbSchema(site: URL, crumbs: { name: string; url: string }[]) {
  return {
    '@context': ctx,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: new URL(c.url, site).href,
    })),
  };
}

/** A procedure with ordered steps. Used on /okf for the publish loop — one of
 *  the few structured-data types still earning a rich result, and the steps are
 *  derived from the same array the page renders so the two cannot disagree. */
export function howToSchema(args: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) {
  return {
    '@context': ctx,
    '@type': 'HowTo',
    name: args.name,
    description: args.description,
    step: args.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function faqPageSchema(items: { q: string; a: string }[]) {
  return {
    '@context': ctx,
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}
