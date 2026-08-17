// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.SITE_URL || 'https://knomit.io';
// Placeholder home — update once the public repo location is finalized.
const GITHUB = 'https://github.com/knomit/knomit';

// Collapsible left nav + right TOC, persisted per-visitor in localStorage.
// Runs at head-parse so the saved state is applied to <html> before first paint
// (no flash / layout shift), then injects the edge-tab handles on load.
const PANEL_TOGGLE_SCRIPT = `
(function () {
  var d = document.documentElement, KL = 'klps:left', KR = 'klps:right';
  try {
    if (localStorage.getItem(KL) === '1') d.classList.add('klps-left-collapsed');
    if (localStorage.getItem(KR) === '1') d.classList.add('klps-right-collapsed');
  } catch (e) {}
  var CH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  function mk(id, side, label, key) {
    var b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = 'klps-toggle klps-toggle--' + side;
    b.setAttribute('aria-label', label); b.title = label; b.innerHTML = CH;
    b.addEventListener('click', function () {
      var on = d.classList.toggle('klps-' + side + '-collapsed');
      try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
    });
    return b;
  }
  function setup() {
    if (!document.getElementById('klps-toggle-left')) {
      document.body.appendChild(mk('klps-toggle-left', 'left', 'Toggle navigation sidebar', KL));
    }
    if (!document.getElementById('klps-toggle-right')) {
      document.body.appendChild(mk('klps-toggle-right', 'right', 'Toggle table of contents', KR));
    }
  }
  if (document.readyState !== 'loading') setup();
  else document.addEventListener('DOMContentLoaded', setup);
  document.addEventListener('astro:page-load', setup);
})();
`;

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // One canonical URL shape for every route: with the slash. Cloudflare Pages
  // already 308s /foo -> /foo/, so a hand-written href without the slash costs
  // every crawler and visitor an extra hop, and splits link equity across two
  // URLs. This setting makes `astro dev`/`preview` match production; it does
  // NOT rewrite the hrefs we author, so the links themselves are written with
  // the slash and tests/unit/trailing-slash.test.ts fails CI if one drifts.
  trailingSlash: 'always',
  // Marketing pages own the root; Starlight is mounted under /docs.
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
    }),
    starlight({
      title: 'knomit',
      // Starlight defaults to "Page | knomit"; the marketing pages all title
      // themselves "Page — subtitle". Same separator on both halves of the site
      // so a SERP listing doesn't read as two different properties.
      titleDelimiter: '—',
      description: 'Git-backed knowledge for AI agents. Knowledge + commit.',
      tagline: 'Git-backed knowledge for AI agents.',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'knomit',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB }],
      customCss: ['./src/styles/theme.css', './src/styles/starlight.css'],
      // Dark-only code blocks, framed like the marketing terminal cards.
      expressiveCode: {
        themes: ['github-dark'],
        styleOverrides: {
          borderRadius: 'var(--k-radius)',
          borderColor: 'var(--k-hairline)',
          codeBackground: 'var(--k-surface-1)',
          frames: {
            editorBackground: 'var(--k-surface-1)',
            terminalBackground: 'var(--k-surface-1)',
            terminalTitlebarBackground: 'var(--k-surface-2)',
            terminalTitlebarBorderBottomColor: 'var(--k-hairline)',
            shadowColor: 'transparent',
          },
        },
      },
      // Mount Starlight under /docs rather than taking over the whole site.
      routeMiddleware: [],
      disable404Route: true,
      pagination: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Quick start', slug: 'docs/quick-start' },
            { label: 'Overview & architecture', slug: 'docs/overview' },
            { label: 'Concepts', slug: 'docs/concepts' },
            { label: 'Ontologies', slug: 'docs/ontologies' },
            { label: 'Lenses', slug: 'docs/lenses' },
          ],
        },
        {
          label: 'Interfaces',
          items: [
            { label: 'MCP tools', slug: 'docs/mcp-tools' },
            // The REST reference is a single Scalar page outside Starlight.
            { label: 'REST API', link: '/docs/api/' },
            { label: 'Web UI', slug: 'docs/web-ui' },
            { label: 'Desktop app', slug: 'docs/desktop' },
            { label: 'CLI reference', slug: 'docs/cli-reference' },
          ],
        },
        {
          label: 'Publish',
          items: [{ label: 'OKF export', slug: 'docs/okf' }],
        },
        {
          label: 'Integrations',
          items: [
            { label: 'Claude Code', slug: 'docs/claude-code' },
            { label: 'Claude Cowork', slug: 'docs/claude-cowork' },
          ],
        },
        {
          label: 'Operate',
          items: [
            { label: 'Configuration', slug: 'docs/configuration' },
            { label: 'Remote sync', slug: 'docs/remote-sync' },
            { label: 'Observability', slug: 'docs/observability' },
            { label: 'Deployment', slug: 'docs/deployment' },
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'Synthesis & hypotheses', slug: 'docs/synthesis' },
            { label: 'Emergent discovery', slug: 'docs/discovery' },
            { label: 'Embeddings', slug: 'docs/embeddings' },
          ],
        },
      ],
      components: {
        // Dark-only product, branded to match the marketing chrome.
        // TwoColumnContent is overridden to append the marketing footer after
        // the content — see the component for why it isn't the Footer slot.
        TwoColumnContent: './src/components/starlight/TwoColumnContent.astro',
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        SiteTitle: './src/components/starlight/SiteTitle.astro',
        SocialIcons: './src/components/starlight/SocialIcons.astro',
        Head: './src/components/starlight/Head.astro',
        // Starlight ships the mobile and desktop tables of contents as two
        // separate DOM trees, each hidden by CSS at the other's breakpoint, so
        // "On this page" and its whole link list land twice in the text layer
        // of every docs page. The override keeps the mobile one out of the
        // served HTML until a narrow viewport needs it — see the component.
        MobileTableOfContents: './src/components/starlight/MobileTableOfContents.astro',
      },
      head: [
        // og:image is emitted by the Head override instead, so it can vary by
        // route — a tag injected here lands on every docs page unconditionally.
        {
          tag: 'script',
          content: PANEL_TOGGLE_SCRIPT,
        },
      ],
    }),
    mdx(),
  ],
});
