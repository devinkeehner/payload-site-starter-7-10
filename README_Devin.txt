# Custom Payload Dashboard and Sidebar Grouping

This project uses a single source of truth for collection grouping to ensure the Payload admin sidebar and dashboard remain consistent.

## How It Works

- The file `src/components/admin/collectionGroups.ts` exports an array of collection definitions for the "Content" group.
- The custom dashboard (`src/components/admin/CustomDashboard.tsx`) uses this array to render the "Content" section with links to each collection.
- To update the "Content" group (for both sidebar and dashboard), edit `collectionGroups.ts` only.
- For sidebar grouping, import and use the same array in each collection config (set `admin: { group: 'Content' }` for each listed collection).
- For dashboard grouping, the dashboard component automatically stays in sync.

## How to Add or Remove Collections

1. Edit `src/components/admin/collectionGroups.ts` to add or remove collections from the `CONTENT_COLLECTIONS` array.
2. Make sure each collection config sets `admin: { group: 'Content' }` if you want it grouped in the sidebar as well.
3. The dashboard and sidebar will both update accordingly.

---

This approach ensures you never have to update grouping logic in more than one place!
