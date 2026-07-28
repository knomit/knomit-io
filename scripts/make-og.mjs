#!/usr/bin/env node
/**
 * Renders the social/OG cards (1200×630) from inline SVG built around the knomit
 * mark. Run via `npm run og`; the PNGs are committed so the normal build needs
 * no image pipeline.
 *
 * OG cards surface in social unfurls only — X/Twitter, LinkedIn, Slack, Discord,
 * iMessage — never in Google results and never on the page. A page earns its own
 * card when it would be shared into a context where the site-wide card says
 * nothing useful: /okf gets posted into conversations about OKF, where "a
 * distributed, decentralized knowledge base" does not answer the question the
 * reader has.
 *
 * Fonts are the system stack on purpose: sharp rasterises through librsvg, which
 * resolves fonts from the host, so a webfont name here would silently fall back
 * on whatever machine runs this.
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');

const SANS = 'Helvetica, Arial, sans-serif';
const MONO = 'monospace';

/** Shared chrome: the glow, the dot grid, and the mark. */
const chrome = ({ markX, markY, markScale }) => `
  <defs>
    <radialGradient id="glow" cx="78%" cy="22%" r="60%">
      <stop offset="0%" stop-color="#1c3326"/>
      <stop offset="100%" stop-color="#141414"/>
    </radialGradient>
    <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" opacity="0.04"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#dots)"/>

  <g transform="translate(${markX},${markY}) scale(${markScale})">
    <rect x="12" y="12" width="56" height="56" rx="10" transform="rotate(45 40 40)" fill="#77cc99"/>
    <line x1="30" y1="24" x2="30" y2="56" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <path d="M30 40 Q38 36 50 24" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M30 40 Q38 44 50 56" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="30" cy="24" r="3.5" fill="#111"/>
    <circle cx="30" cy="56" r="3.5" fill="#111"/>
    <circle cx="50" cy="24" r="3.5" fill="#111"/>
    <circle cx="50" cy="56" r="3.5" fill="#111"/>
    <circle cx="30" cy="40" r="3.5" fill="#111"/>
  </g>`;

const wrap = (inner) =>
  `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

/** The site-wide card. Unchanged — it is committed and already in the wild. */
const siteCard = wrap(`
  ${chrome({ markX: 96, markY: 150, markScale: 2.0 })}

  <text x="270" y="250" font-family="${SANS}" font-size="92" font-weight="700" fill="#eeeeee" letter-spacing="-2">knomit</text>
  <text x="272" y="318" font-family="${SANS}" font-size="34" fill="#77cc99">Knowledge + commit.</text>

  <text x="98" y="468" font-family="${SANS}" font-size="42" font-weight="600" fill="#dddddd">A distributed, decentralized knowledge base.</text>
  <text x="98" y="524" font-family="${SANS}" font-size="27" fill="#aaaaaa">Built from facts, not documents. Typed, provenanced, ontological.</text>

  <text x="98" y="588" font-family="${MONO}" font-size="22" fill="#666666">knomit.io · knowledge + commit</text>
`);

/**
 * The /okf card. Same family — same ground, same mark — but the mark is smaller
 * and the headline carries the term, because the reader of this card arrived
 * from an OKF conversation and needs the subject before the brand.
 */
const okfCard = wrap(`
  ${chrome({ markX: 98, markY: 74, markScale: 1.05 })}

  <text x="196" y="132" font-family="${SANS}" font-size="46" font-weight="700" fill="#eeeeee" letter-spacing="-1">knomit</text>
  <text x="198" y="170" font-family="${MONO}" font-size="24" fill="#77cc99">knomit-okf</text>

  <text x="98" y="330" font-family="${SANS}" font-size="60" font-weight="700" fill="#eeeeee" letter-spacing="-1.5">Publish your knowledge base</text>
  <text x="98" y="400" font-family="${SANS}" font-size="60" font-weight="700" fill="#77cc99" letter-spacing="-1.5">as Open Knowledge Format.</text>

  <text x="98" y="470" font-family="${SANS}" font-size="27" fill="#aaaaaa">Portable markdown, from one git URL. Deterministic, and validated</text>
  <text x="98" y="508" font-family="${SANS}" font-size="27" fill="#aaaaaa">against the spec before it commits.</text>

  <text x="98" y="588" font-family="${MONO}" font-size="22" fill="#666666">knomit.io/okf · exports to OKF 0.2</text>
`);

const cards = [
  { name: 'og.png', svg: siteCard },
  { name: 'og-okf.png', svg: okfCard },
];

for (const { name, svg } of cards) {
  const out = path.join(PUBLIC, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`✓ wrote ${out}`);
}
