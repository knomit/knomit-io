import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

const isPublished = (post: BlogPost) =>
  !post.data.draft || import.meta.env.DEV;

/** Published posts, newest first. Drafts are visible only in dev. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog', isPublished);
  return posts.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime()
  );
}

export const postHref = (post: BlogPost) => `/blog/${post.id}/`;
