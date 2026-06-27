// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.SITE_URL || 'https://knomit.io';
// Placeholder home — update once the public repo location is finalized.
const GITHUB = 'https://github.com/knomit/knomit';

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
            { label: 'Concepts', slug: 'docs/concepts' },
          ],
        },
        {
          label: 'Interfaces',
          items: [
            { label: 'MCP tools', slug: 'docs/mcp-tools' },
            { label: 'Web UI', slug: 'docs/web-ui' },
            // The REST reference is a single Scalar page outside Starlight.
            { label: 'REST API', link: '/docs/api' },
          ],
        },
        {
          label: 'Operate',
          items: [
            { label: 'Configuration', slug: 'docs/configuration' },
            { label: 'Remote sync', slug: 'docs/remote-sync' },
          ],
        },
      ],
      components: {
        // Dark-only product, branded to match the marketing chrome.
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
        SiteTitle: './src/components/starlight/SiteTitle.astro',
        SocialIcons: './src/components/starlight/SocialIcons.astro',
      },
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${SITE}/og.png` },
        },
      ],
    }),
    mdx(),
  ],
});
