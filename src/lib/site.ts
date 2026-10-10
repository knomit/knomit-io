/** Shared, single-source site constants. */
export const SITE_NAME = 'knomit';
export const SITE_TAGLINE = 'Knowledge + commit.';
/** One-line product category, used under the logo and in fallbacks. */
export const SITE_SUBLINE =
  'A distributed, decentralized knowledge distillation factory.';
/** The fabric statement, for on-page copy, RSS and llms.txt where the full
 *  framing matters. */
export const SITE_DESCRIPTION =
  'A distributed, decentralized knowledge distillation factory: a fabric that connects many agents and many knowledge bases, so that what any one of them learns is accumulated, distilled and put to use by all of them. Learning is paid once across the network instead of once per agent. Knowledge is kept as typed, signed facts in git.';
/** ≤160-char meta description for SERP snippets. The long SITE_DESCRIPTION
 *  stays for on-page copy where the full framing matters. */
export const SITE_DESCRIPTION_SHORT =
  'A distributed knowledge distillation factory: many agents and knowledge bases accumulate, distill and use what any one learns, as signed facts in git.';
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
