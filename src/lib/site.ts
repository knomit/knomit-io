/** Shared, single-source site constants. */
export const SITE_NAME = 'knomit';
export const SITE_TAGLINE = 'Knowledge + commit.';
/** One-line product category, used under the logo and in fallbacks. */
export const SITE_SUBLINE =
  'A distributed, decentralized knowledge base — built from facts, not documents.';
export const SITE_DESCRIPTION =
  'A distributed, decentralized knowledge base built from concise, typed facts — not documents. Confidence, provenance, and ontology; facts evolve and discovery spawns new ones. Humans and agents converge on one source of truth.';
/** ≤160-char meta description for SERP snippets. The long SITE_DESCRIPTION
 *  stays for on-page copy where the full framing matters. */
export const SITE_DESCRIPTION_SHORT =
  'Git-backed knowledge for AI agents: typed, provenanced facts in a distributed, decentralized knowledge base — not documents. Open source, MCP-native.';
// Placeholder home — update once the public repo location is finalized.
export const GITHUB_URL = 'https://github.com/knomit/knomit';

/** Whether the site's primary nav (header, footer, docs top-nav) links out to
 *  /explore. /explore itself always renders the live KB browser against a
 *  build-time static bundle — it does not depend on this flag — so this only
 *  gates *discoverability* of an already-shipped page. */
export const DEMO_LIVE = true;

/** Twitter/X handle incl. leading @, or '' if none yet. Tags render only when set. */
export const SITE_TWITTER = '@knomit_io';

/** Google Search Console verification token, or '' if unverified.
 *  Not needed if the property is verified via the Google Analytics tag below. */
export const GSC_VERIFICATION = '';

/** GA4 Measurement ID (G-XXXXXXXXXX), or '' to disable analytics.
 *  The gtag snippet loads only in production builds AND only when this is set. */
export const GA_MEASUREMENT_ID = 'G-DBEJQ5N1PX';
