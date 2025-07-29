import React from 'react';
import { CONTENT_COLLECTIONS } from './collectionGroups';
// Dashboard groups mirror sidebar order
const GROUPS: Record<string, { slug: string; label: string }[]> = {
  Content: CONTENT_COLLECTIONS,
  'Site Settings': [
    { slug: 'rep-info', label: 'Rep Info' },
    { slug: 'navbars', label: 'Navbars' },
    { slug: 'standard-media', label: 'Standard Photos' },
    { slug: 'site-seo', label: 'Site SEO' },
  ],
  Admin: [
    { slug: 'categories', label: 'Categories' },
    { slug: 'users', label: 'Users' },
    { slug: 'tenants', label: 'Tenants' },
  ],
  'Forms and Surveys': [
    { slug: 'forms', label: 'Forms' },
    { slug: 'form-submissions', label: 'Form Submissions' },
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
