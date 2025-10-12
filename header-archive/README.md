# Custom Payload Admin Header Snapshot

This folder stores the custom admin header implementation so it can be restored later without keeping it in Git history.

## Files

- `TenantBreadcrumbBar.tsx` — React component that renders the tenant-aware breadcrumb trail and logo inline.
- `TenantHeaderIndicator.tsx` — Provider component that mounts a sticky header, figures out the current collection/document labels, and keeps the tenant dropdown interactive.
- `custom.scss` — Admin stylesheet overrides that hide the default Payload breadcrumb bar and adjust spacing for the custom header.

## How it works

1. **TenantBreadcrumbBar**
   - Uses `useActiveTenant()` to resolve the current tenant name/slug.
   - Renders the admin logo and a breadcrumb list: tenant → collection → document.
   - Highlights the tenant crumb (red in light mode, yellow in dark mode) and keeps the tenant link pointing to `/admin`.

2. **TenantHeaderIndicator**
   - Wraps the admin UI via `admin.components.providers`.
   - Listens to `next/navigation` and Payload config to resolve collection metadata.
   - When on a document view, fetches the document title using `useAsTitle` if configured.
   - Renders a sticky `<div>` with `TenantBreadcrumbBar` and disables pointer events on the wrapper so sidebar controls remain usable.
   - Includes a `MutationObserver` to strip disabled styles/attributes from the tenant dropdown so it stays interactive when switching tenants mid-edit.

3. **custom.scss**
   - Hides the baked-in `.step-nav` breadcrumbs.
   - Removes extra padding at the top of default/minimal layouts so the sticky header sits flush.

## Re-applying the header

1. Copy the files back into the live admin components directory:
   ```bash
   cp header-archive/TenantBreadcrumbBar.tsx src/components/admin/
   cp header-archive/TenantHeaderIndicator.tsx src/components/admin/
   cp header-archive/custom.scss src/app/(payload)/custom.scss
   ```
2. Ensure `src/components/admin/hooks/useActiveTenant.ts` exists (recreate from this snapshot or the earlier implementation).
3. Register the provider inside `src/payload.config.ts`:
   ```ts
   admin: {
     components: {
       providers: [
         '@/components/admin/TenantBadgeProvider#default',
         '@/components/admin/TenantSwitchGuard#default',
         '@/components/admin/TenantHeaderIndicator#default',
       ],
     },
   }
   ```
4. Restart the Payload dev server (`pnpm dev`).

Keep this folder ignored so it remains your private reference copy.
