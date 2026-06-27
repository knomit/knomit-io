# knomit-site

The public website for **knomit** — git-backed memory for AI agents
([knomit.io](https://knomit.io)). Marketing-first landing experience, a
documentation section, and a weekly blog, all in one fast static site.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).
Dark-only, themed from the real knomit web UI.

## Quick start

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/ (runs the sync first)
npm run preview  # serve the built site
npm run check    # astro + TypeScript + content-schema check
npm test         # Playwright smoke tests (build first)
```

### The build-time sync

`npm run dev`/`build` first run `scripts/sync.mjs`, which pulls knomit's canonical
`openapi.yaml` (and README) so the REST API docs are generated from source, never
hand-copied. It finds the source automatically, in this order:

1. **`KNOMIT_SRC`** — a local knomit checkout (or set it once in a local `.env`).
2. **Auto-detected** — a sibling `../knomit` (or `../../knomit`) checkout. This is
   why the typical side-by-side layout needs **no configuration**.
3. **GitHub** — `KNOMIT_REPO_SLUG` @ `KNOMIT_REF`, with `GITHUB_TOKEN` for private
   access.
4. **Vendored** — a previously-synced copy in `src/generated/` (kept as a fallback
   so a build never breaks if the source is briefly unreachable).

## How it's structured

```
src/
  pages/            index, concepts, use-cases, explore, blog/, rss.xml, 404
  content/
    docs/docs/      Starlight docs (MDX) — served under /docs/*
    blog/           blog posts (MDX)
  components/       Header, Footer, Hero BranchGraph, FactCard, FeatureGrid, …
  layouts/          BaseLayout, BlogPost
  styles/           theme.css (design tokens), starlight.css, prose.css
  generated/        synced from the knomit source at build time (gitignored)
scripts/
  sync.mjs          pulls openapi.yaml + README from the knomit repo (prebuild)
  make-og.mjs       regenerates public/og.png (run on demand)
```

### Docs are generated, not hand-copied

The REST API reference under `/docs/api/` is rendered from knomit's canonical
`internal/web/static/openapi.yaml` via
[`starlight-openapi`](https://starlight-openapi.vercel.app/). `scripts/sync.mjs`
fetches that spec (and the product README) on every build, so the reference
**cannot drift**. Source resolution: local `KNOMIT_SRC` → pinned GitHub raw
(`KNOMIT_REF`) → a previously-synced copy.

## Content authoring

- **Blog:** drop an `.mdx` file in `src/content/blog/`. Frontmatter schema lives in
  [`src/content.config.ts`](src/content.config.ts) (`title`, `description`,
  `pubDate`, `tags`, `draft`, …). Drafts are hidden in production, visible in dev.
  See the seed post for the template. RSS is at `/rss.xml`.
- **Docs:** add an `.mdx` under `src/content/docs/docs/` and reference its slug in
  the Starlight `sidebar` in [`astro.config.mjs`](astro.config.mjs).
- **Theme:** all tokens live in [`src/styles/theme.css`](src/styles/theme.css),
  carried from the product UI (mint-green `#7c9` brand, layered darks, semantic
  blue/amber/red). Change them in one place.

## Deploy

**knomit.io** → Cloudflare Pages. Build command `npm run build`, output `dist/`.
Provide a `KNOMIT_SYNC_TOKEN` build secret while the knomit repo is private; set
`SITE_URL` for canonical/OG URLs. PR preview deploys are recommended.
