// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';

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
      // Mount Starlight under /docs rather than taking over the whole site.
      routeMiddleware: [],
      disable404Route: true,
      pagination: true,
      plugins: [
        // REST API reference, generated from knomit's canonical OpenAPI spec.
        starlightOpenAPI([
          {
            base: 'docs/api',
            label: 'REST API',
            schema: './src/generated/openapi.yaml',
            sidebarMethodBadges: true,
          },
        ]),
      ],
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
            ...openAPISidebarGroups,
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
        // Use the marketing header/footer chrome where it makes sense later.
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
