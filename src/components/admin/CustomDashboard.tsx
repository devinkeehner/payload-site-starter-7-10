import React from 'react';
// Dashboard groups mirror sidebar order
const GROUPS: Record<string, { slug: string; label: string }[]> = {
  Content: [
    { slug: 'posts', label: 'Posts' },
    { slug: 'pages', label: 'Pages' },
    { slug: 'wordpress-posts', label: 'Wordpress Posts' },
    { slug: 'media', label: 'Media' },
    { slug: 'categories', label: 'Categories' },
  ],
  Site: [{ slug: 'navbars', label: 'Navbars' }],
  Admin: [
    { slug: 'users', label: 'Users' },
    { slug: 'tenants', label: 'Tenants' },
  ],
  Misc: [
    { slug: 'authors', label: 'Authors' },
    { slug: 'tags', label: 'Tags' },
  ],
};

const CustomDashboard = () => (
  <div style={{ padding: '2rem' }}>
    {Object.entries(GROUPS).map(([group, links]) => (
      <section key={group} style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{group}</h2>
        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem' }}>
          {links.map(({ slug, label }) => (
            <li key={slug}>
              <a href={`/admin/collections/${slug}`}>{label}</a>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

export default CustomDashboard;
