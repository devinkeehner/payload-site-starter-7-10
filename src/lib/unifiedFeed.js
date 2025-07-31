export function mergeAndSort(posts = [], wpPosts = []) {
  const normalize = (doc, collection) => ({
    collection,
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    publishedDate: doc.publishedAt || doc.publishedDate || doc.createdAt,
    excerpt: doc.excerpt ?? doc.summary ?? '',
  })

  return [
    ...posts.map((d) => normalize(d, 'posts')),
    ...wpPosts.map((d) => normalize(d, 'wordpressposts')),
  ].sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime())
}
