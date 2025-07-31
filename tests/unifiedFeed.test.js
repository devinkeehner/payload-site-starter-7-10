import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeAndSort } from '../src/lib/unifiedFeed.js'

test('merges and sorts by published date desc', () => {
  const posts = [
    { id: '1', title: 'Post', slug: 'p1', publishedAt: '2024-01-01' },
  ]
  const wp = [
    { id: '2', title: 'WP', slug: 'w1', publishedAt: '2024-01-02' },
  ]
  const result = mergeAndSort(posts, wp)
  assert.equal(result.length, 2)
  assert.equal(result[0].id, '2')
  assert.equal(result[0].collection, 'wordpressposts')
})

test('normalizes fields', () => {
  const posts = [
    { id: '1', title: 'Post', slug: 'p1', publishedAt: '2024-01-03', excerpt: 'ex' },
  ]
  const wp = []
  const [doc] = mergeAndSort(posts, wp)
  assert.deepEqual(doc, {
    collection: 'posts',
    id: '1',
    title: 'Post',
    slug: 'p1',
    publishedDate: '2024-01-03',
    excerpt: 'ex',
  })
})
