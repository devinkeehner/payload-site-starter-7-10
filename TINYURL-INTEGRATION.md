# TinyURL integration review

This is a local review implementation for WebsitesGOV’s Payload backend (`devinkeehner/payload-site-starter-7-10`, base commit `4b349a7`). The existing Next frontend (`devinkeehner/hro_next.js_new`, `be4d0c8`) requires no changes. Canonical routes follow the frontend sitemap: main posts `/post/:slug`, main pages `/:slug`, tenant content `/:tenant/:slug`, and homepages `/` or `/:tenant`.

## Editor workflow

1. In Site Profile → TinyURL, enter the domain already registered for that site in TinyURL and save. Enter only the hostname. A domain can belong to exactly one Site Profile; domain ownership cannot be moved while links exist.
2. Click **Import all domain links**. Both active and archived links are imported, with pagination. The account listing is filtered locally by the exact configured domain. Import makes only GET requests to TinyURL. A retry reconciles completed records if a timeout or rate limit interrupts an import.
3. Open **Website → Short Links**. Assigned site editors can view and edit links, create arbitrary public redirects with an alias and destination, or rename an existing alias. Alias and destination changes must be saved separately because TinyURL has separate APIs for them. Archived links remain visible; restoring them happens in TinyURL, followed by another import. Deletion is disabled to preserve links and history.
4. On a saved and published post or page, enter an alias in the sidebar and click **Create / sync short link**, then copy the resulting short URL. The destination is derived on the server from the saved published document. Existing aliases are shown on reopening the document. A new alias preserves earlier aliases, and they continue following the content.
5. Published slug changes update linked destinations. Draft saves do not change live links. Sync errors appear in Short Links and in the document sidebar; resolve the error and use **Create / sync short link** to retry. The collection does not let editors manually redirect a content-linked alias away from its canonical content URL.

Content with active short links cannot be moved to another site, deleted or unpublished. To unpublish/delete it, archive the links in TinyURL, then import the site’s links. Archived links no longer block unpublishing/deletion and are not updated on later publication. Domain reassignment and moving linked content remain deliberate maintainer operations rather than implicit link transfers.

## Configuration needed separately

The backend needs `TINYURL_API_TOKEN` supplied by its existing secret-management process, with permission to list, create, rename and change destinations for the configured domains. No token was generated, read from an account, written into an environment file, or tested against live links. The account’s existing plan/API permissions must support the operations; this patch changes no subscriptions or domain registrations.

`NEXT_PUBLIC_SITE_URL` must identify the public frontend origin (for example `https://www.cthousegop.com`), not the admin/backend or localhost. Site Profile domains must be set to the already-existing TinyURL domains. No credential belongs in Site Profile or the browser. Do not paste tokens into chat.

Generated Payload types and the admin import map are included. MongoDB’s normal Payload startup builds the new optional unique domain and short-link key indexes. Restart with the normal development server for collection/config changes; do not use stale configuration under `dev:fast`.

## Safeguards and limits

All custom endpoints and collection hooks verify assigned-site membership (or the existing super role), independent of the selected-tenant cookie. Content endpoints also check existing collection update permission. Remote edits first verify the stored destination has not changed; collisions are rejected and unrelated aliases are never adopted. Imports preserve source relationships and mark externally changed content-linked destinations for review rather than adopting them as new canonical targets.

Only public HTTP(S) destinations are accepted for new/edited links. Draft/preview paths and credential query parameters are rejected. Provider errors are reduced to safe actionable messages without echoing submitted URLs, credentials or account details. Pagination follows only the fixed API origin and matching listing path; repeated cursors stop the import.

TinyURL and MongoDB cannot participate in one atomic transaction, and the provider does not document conditional destination updates. A remote success followed by a database failure needs import/reconciliation; concurrent external edits between the check and update cannot be prevented by the provider contract. No automatic retries are made for remote mutations. Large imports may need retries under hosting request time limits; completed local records are retained. Live authenticated account behavior and browser end-to-end behavior have not been exercised, because no account credentials or runtime database were configured in this isolated checkout.

## Validation

- Mocked API, workflow, access, publication and UI-handler tests (including the existing dashboard link test).
- Full repository TypeScript check.
- ESLint for all new code and directly edited collection/admin/access files.
- Payload type and admin import-map generation.
- `git diff --check`.

No actual TinyURL mutation, public deploy or push was performed. Original WebsitesGOV checkouts were not edited; the original backend’s existing `src/payload.config.ts` change remains intact. Campaign checkouts and workers were not modified.

Official API contract inspected: https://tinyurl.com/openapi/v2.json, linked by https://tinyurl.com/app/dev. Create uses `POST /create`; rename uses `PATCH /update`; destination changes use `PATCH /change`; lookup uses `GET /alias/{domain}/{alias}`; imports use `GET /urls/available` and `GET /urls/archived`.
