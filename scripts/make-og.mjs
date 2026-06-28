#!/usr/bin/env node
/**
 * Renders the social/OG card (public/og.png, 1200×630) from an inline SVG built
 * around the knomit mark. Run once via `npm run og`; the PNG is committed so the
 * normal build needs no image pipeline.
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'og.png');

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
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

  <!-- the mark, enlarged -->
  <g transform="translate(96,150) scale(2.0)">
    <rect x="12" y="12" width="56" height="56" rx="10" transform="rotate(45 40 40)" fill="#77cc99"/>
    <line x1="30" y1="24" x2="30" y2="56" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <path d="M30 40 Q38 36 50 24" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M30 40 Q38 44 50 56" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="30" cy="24" r="3.5" fill="#111"/>
    <circle cx="30" cy="56" r="3.5" fill="#111"/>
    <circle cx="50" cy="24" r="3.5" fill="#111"/>
    <circle cx="50" cy="56" r="3.5" fill="#111"/>
    <circle cx="30" cy="40" r="3.5" fill="#111"/>
  </g>

  <text x="270" y="250" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="700" fill="#eeeeee" letter-spacing="-2">knomit</text>
  <text x="272" y="318" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#77cc99">Knowledge + commit.</text>

  <text x="98" y="468" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="600" fill="#dddddd">A distributed, decentralized knowledge base.</text>
  <text x="98" y="524" font-family="Helvetica, Arial, sans-serif" font-size="27" fill="#aaaaaa">Built from facts, not documents. Typed, provenanced, ontological.</text>

  <text x="98" y="588" font-family="monospace" font-size="22" fill="#666666">knomit.io · knowledge + commit</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`✓ wrote ${OUT}`);
