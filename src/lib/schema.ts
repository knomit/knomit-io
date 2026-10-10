import { SITE_NAME, GITHUB_URL, SITE_TWITTER, SITE_DESCRIPTION } from './site';

const ctx = 'https://schema.org';

export function organizationSchema(site: URL) {
  // Every profile that provably belongs to the same entity, so a knowledge
  // graph can reconcile them. Derived from SITE_TWITTER rather than spelled out
  // again — the handle is already the source for twitter:site/twitter:creator,
  // and the entry drops out entirely if the handle is ever cleared.
  const sameAs = [GITHUB_URL];
  if (SITE_TWITTER) sameAs.push(`https://twitter.com/${SITE_TWITTER.replace(/^@/, '')}`);
  return {
    '@context': ctx,
    '@type': 'Organization',
    name: SITE_NAME,
    url: site.origin + '/',
    logo: new URL('/favicon.svg', site).href,
    sameAs,
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
    // Release binaries exist for macOS arm64 and Linux amd64 (plus a container
    // image); Windows builds and runs from source but has no release asset.
    operatingSystem: 'macOS, Linux, Windows (from source)',
    url: site.origin + '/',
    description: SITE_DESCRIPTION,
    featureList: [
      'Typed, atomic facts in plain markdown, not chunked documents',
      'Per-agent branches with signed commits and a persisted agent identity',
      'Consensus on main by review or automatic merge, with field-by-field conflict merge',
      'Real-time sync, peer hosting over mTLS, and a fleet of registered instances',
      'Signature verification at acceptance against the fleet member records',
      'Review (prune, distill, reflect), hypotheses, and emergent discovery',
      'Motifs: the shared pattern facts about different subjects instantiate',
      'Experiments: local branches that commit or roll back as a unit',
      'Triggers and recipes that react to new knowledge and launch work',
      'Lenses that query several knowledge bases as one',
      'Templates and playbooks for new knowledge bases',
      'MCP tools for any MCP client, a REST API (HAL+JSON) and a web UI',
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

/** The blog index as one named collection rather than nine unrelated cards.
 *  `blogPost` carries only headline/url/date: the full BlogPosting lives on
 *  each post's own page, and repeating it here would give a crawler two nodes
 *  describing the same article with this one always the staler of the two. */
export function blogSchema(args: {
  site: URL;
  url: URL;
  name: string;
  description: string;
  posts: { title: string; url: URL; datePublished: string }[];
}) {
  return {
    '@context': ctx,
    '@type': 'Blog',
    name: args.name,
    description: args.description,
    url: args.url.href,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: args.site.origin + '/' },
    blogPost: args.posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: p.url.href,
      datePublished: p.datePublished,
      mainEntityOfPage: { '@type': 'WebPage', '@id': p.url.href },
    })),
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
