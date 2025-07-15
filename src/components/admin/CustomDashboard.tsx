import React from 'react';
import { CONTENT_COLLECTIONS } from './collectionGroups';

const CustomDashboard = ({ path }: { path?: string }) => (
  <div style={{ padding: '2rem' }}>
    <h2>Content</h2>
    <ul>
      {CONTENT_COLLECTIONS.map(({ slug, label }) => (
        <li key={slug}>
          <a href={`/admin/collections/${slug}`}>{label}</a>
        </li>
      ))}
    </ul>
    {/* Add more groups here if you like */}
  </div>
);

export default CustomDashboard;
