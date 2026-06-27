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

// The live demo. The public instance will live at https://kb.knomit.io; for now
// the iframe points at a local server for testing. Swap DEMO_URL back when the
// hosted instance is up.
export const DEMO_LABEL = 'kb.knomit.io';
export const DEMO_URL = 'http://localhost:19278/';

/** When true, /explore embeds the live UI; when false it shows the teaser.
 *  Keep false in production until the hosted instance (kb.knomit.io) is up —
 *  DEMO_URL points at localhost and must never ship in an iframe. */
export const DEMO_LIVE = false;

export const PORT = 19278;

/** Twitter/X handle incl. leading @, or '' if none yet. Tags render only when set. */
export const SITE_TWITTER = '';
