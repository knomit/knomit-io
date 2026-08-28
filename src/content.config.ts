import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

/** Weekly real-world use-case articles. Drop an .mdx file in src/content/blog/. */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      /**
       * Search-result overrides. Both are OPTIONAL and exist because `title`
       * and `description` are page CONTENT here, not metadata: `title` is the
       * article's headline and `description` is rendered as its standfirst.
       * Cutting them to fit a SERP would edit the article.
       *
       * So a post that would truncate in results supplies a short form for the
       * `<title>` / `<meta name=description>` only. The caps are enforced at
       * build time rather than by a test, so an over-long override cannot ship:
       * ~60 chars is where Google truncates a title, ~160 a description, and
       * the blog's `<title>` appends " — knomit blog" (14), hence 46 here.
       */
      seoTitle: z.string().max(46).optional(),
      seoDescription: z.string().max(160).optional(),
      /**
       * The post's FAQ section, repeated as data so the page can also ship it
       * as FAQPage JSON-LD. Answers here are the article's own answers with
       * the markdown stripped: the visible section stays the source of truth,
       * and a parser reading the structured data gets the same words a reader
       * gets. Omit it and the post renders exactly as before.
       */
      faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      author: z.string().default('The knomit team'),
      tags: z.array(z.string()).default([]),
      heroImage: image().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog,
};
