# Private tenant websites

The **Private site** checkbox on a Site (`isPrivate`, default false) hides that tenant from anonymous visitors without archiving or deleting its content. Publishing an individual page does not override tenant privacy. Disable Private site and publish the desired pages separately when ready to launch.

## Access

- Anonymous tenant pages (including nested Contact/About/newsroom/blog/legacy routes) return HTTP 404.
- CMS reads and search exclude private content for anonymous callers; sitemaps use public content only.
- Existing authenticated CMS read permissions remain in force.
- The Site editor's Preview button validates the CMS login and opens a tenant-scoped draft session on the frontend.
- Valid document draft-share links establish the same session. Sessions are signed, last 24 hours, and authorize only one tenant. A draft-mode cookie alone is insufficient.
- Exiting preview removes the session. Service API keys are never set as browser cookies by the new preview flow.
- Private responses use no-store and noindex headers. A failed visibility lookup fails closed.

## Coordinated rollout

This requires both the CMS (`payload-site-starter-7-10`) and representative frontend (`hro_next.js_new`). Deploy both before enabling the flag on any live tenant.

Both apps must have the same nonempty `PREVIEW_SECRET`. The frontend must retain its server-side `PAYLOAD_API_KEY` for visibility lookups and document preview validation. Set the CMS `PREVIEW_FRONTEND_ORIGIN` (or its existing frontend URL equivalent) to the actual representative frontend origin. Do not expose service credentials through NEXT_PUBLIC variables.

Existing tenants remain public by default; there is no bulk migration. For MongoDB, missing `isPrivate` values are treated as public. Regenerate sitemaps and invalidate frontend caches when enabling privacy. The tenant-change hook requests both.

After deployment, test in a fresh anonymous browser and in an authenticated preview session. Verify the homepage and nested pages return 404 anonymously, a valid preview renders the tenant, a different tenant's preview is rejected, and exiting preview restores 404.

## Limits

The public media/CDN bucket is unchanged: existing direct image/file URLs and already downloaded copies remain public. Do not place confidential documents in that bucket. Handwritten historical caucus and leadership content is not rewritten automatically by this setting.

## Validation

- CMS: `pnpm exec vitest run src/lib/tenantPrivacy.test.ts` (7 tests).
- Frontend: `pnpm run test:privacy` (13 tests).
- CMS: `pnpm exec tsc --noEmit --incremental false`.
- Local Next.js browser check with a mock CMS: anonymous contact URL 404; valid preview URL redirects into draft mode and renders HTTP 200; exit preview returns to 404. No live data was changed for the check.

The frontend has pre-existing type errors in page, Flickr, and rich-text types. Production build validation and actual deployment status must be checked independently; passing access tests is not a claim of production deployment.
