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
  // Marketing pages own the root; Starlight is mounted under /docs.
  integrations: [
    react(),
    sitemap(),
    starlight({
      title: 'knomit',
      description: 'Git-backed memory for AI agents. Knowledge + commit.',
      tagline: 'Git-backed memory for AI agents.',
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
          ],
        },
        {
          label: 'Interfaces',
          items: [
            { label: 'MCP tools', slug: 'docs/mcp-tools' },
            // The REST reference is a single Scalar page outside Starlight.
            { label: 'REST API', link: '/docs/api' },
            { label: 'Web UI', slug: 'docs/web-ui' },
            { label: 'Desktop app', slug: 'docs/desktop' },
            { label: 'CLI reference', slug: 'docs/cli-reference' },
          ],
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
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'Synthesis & discovery', slug: 'docs/synthesis' },
            { label: 'Embeddings', slug: 'docs/embeddings' },
          ],
        },
      ],
      components: {
        // Dark-only product, branded to match the marketing chrome.
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        SiteTitle: './src/components/starlight/SiteTitle.astro',
        SocialIcons: './src/components/starlight/SocialIcons.astro',
        Head: './src/components/starlight/Head.astro',
      },
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${SITE}/og.png` },
        },
        {
          tag: 'script',
          content: PANEL_TOGGLE_SCRIPT,
        },
      ],
    }),
    mdx(),
  ],
});
