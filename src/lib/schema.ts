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
    operatingSystem: 'macOS, Linux, Windows',
    url: site.origin + '/',
    description:
      'Git-backed knowledge for AI agents: a distributed knowledge base of typed, provenanced facts.',
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
