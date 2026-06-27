import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, postHref } from '../lib/blog';
import { SITE_DESCRIPTION } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: 'knomit blog',
    description: SITE_DESCRIPTION,
    site: context.site ?? 'https://knomit.io',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postHref(post),
      categories: post.data.tags,
      author: post.data.author,
    })),
    customData: '<language>en-us</language>',
  });
}
