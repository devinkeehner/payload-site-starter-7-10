import payload from 'payload';

async function main() {
  await payload.init({
    secret: process.env.PAYLOAD_SECRET,
    mongoURL: process.env.MONGODB_URI,
  });

  const posts = [
    {
      title: 'Test Post 1',
      slug: 'test-post-1',
      tenant: 'candelora',
      content: [
        {
          type: 'richText',
          value: '<p>This is a dummy test post 1.</p>'
        }
      ],
      status: 'published',
    },
    {
      title: 'Test Post 2',
      slug: 'test-post-2',
      tenant: 'candelora',
      content: [
        {
          type: 'richText',
          value: '<p>This is a dummy test post 2.</p>'
        }
      ],
      status: 'published',
    },
  ];

  for (const post of posts) {
    await payload.create({
      collection: 'posts',
      data: post,
    });
    console.log(`Added: ${post.title}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
