# Environment Setup

## Purpose

This document defines environment variables and external service setup needed for StayOps.

Do not store real secret values in Markdown files.

## Security Rule

Never commit:

- Supabase service role key
- OAuth client secrets
- Beds24 API keys/secrets
- Web Push private keys
- Any production secrets

Use `.env.local` for local development and Vercel environment variables for deployment.

## Environment Files

Expected local file:

```txt
.env.local
```

Current local status:

- `.env.local` exists locally and is ignored by Git.
- All three Supabase variables are configured locally.

Example file to create later:

```txt
.env.example
```

`.env.example` should include variable names only, with placeholder values.

## Supabase

Required variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Current project URL:

```txt
https://sspdgzkytkpmquqsfaup.supabase.co
```

Usage:

- `NEXT_PUBLIC_SUPABASE_URL`: browser/client Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser/client anon key
- `SUPABASE_SERVICE_ROLE_KEY`: server-only admin operations

Important:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- Use service role only in server-only code paths.

Implementation note:

- Supabase clients are initialized lazily so `next build` can run before real environment values are available.
- Browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server/service clients must not be imported into client components.

## App URL

Required variables:

```txt
NEXT_PUBLIC_APP_URL=
```

Examples:

```txt
http://localhost:3000
https://stayops.vercel.app
```

Usage:

- Auth redirects
- Invite links
- PWA metadata if needed

### Local Dev Tools

Optional local-only gate:

```txt
ENABLE_LOCAL_DEV_TOOLS=
```

Usage:

- Set to `true` only in `.env.local` when a localhost-only maintenance endpoint is needed.
- Do not set it in production or staging.
- It does **not** provide a test-login shortcut; QA now signs in with real Google/email accounts.

### Testing the dev server on a phone over any network (Cloudflare quick tunnel)

To open the local dev server on a phone **without** needing the same WiFi (works on cellular too):

1. Start the dev server in WSL: `npm run dev` (binds `*:3000`).
2. Install cloudflared once: download `cloudflared-linux-amd64` to `~/.local/bin/cloudflared`, `chmod +x`.
3. Run a quick tunnel: `~/.local/bin/cloudflared tunnel --url http://localhost:3000 --no-autoupdate`.
   It prints a random `https://<random>.trycloudflare.com` URL — open that on the phone.

Two dev-only allowances make this work (no production effect):

- `next.config.ts` → `allowedDevOrigins` includes `"*.trycloudflare.com"` so Next dev serves HMR/client chunks to the tunnel origin.
- The dev temp-QR route (`src/app/api/dev/attendance/temp-qr/route.ts`) `isLocalDevHost()` also accepts `*.trycloudflare.com` hosts, so the temp clock-in QR page opens through the tunnel. It stays gated by `NODE_ENV=development` + `ENABLE_LOCAL_DEV_TOOLS=true`, so it is never reachable in production regardless of host.

Notes / cautions:

- The quick-tunnel URL is **random per run** and changes whenever cloudflared restarts; the config uses a wildcard so no edit is needed each time.
- A quick tunnel exposes the dev server **publicly** to anyone with the URL — use it only for short testing sessions and stop cloudflared when done.
- Log into the app **through the tunnel URL** on the phone first; the temp-QR page needs an org-scoped session on that origin (otherwise it returns `no_org_context`). Auth callback origin is derived from the request host, so login over the tunnel domain works.

## Google OAuth

Required later for Google login:

```txt
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Depending on Supabase Auth setup, these may be configured inside Supabase dashboard rather than app environment variables.

Document final setup after Supabase Auth is configured.

## Apple Login

Not required for MVP.

Future variables may include:

```txt
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

Apple login is deferred until Apple Developer account is available.

## Beds24

Webhook-first integration.

Variables:

```txt
BEDS24_WEBHOOK_SECRET=
BEDS24_API_BASE_URL=
BEDS24_API_TOKEN=
BEDS24_API_REFRESH_TOKEN=
CRON_SECRET=
```

Usage:

- `BEDS24_WEBHOOK_SECRET`: verify incoming webhook requests if supported/configured
- `BEDS24_API_BASE_URL`: Beds24 API base URL
- `BEDS24_API_TOKEN`: short-lived Beds24 access token for direct inventory/property calls
- `BEDS24_API_REFRESH_TOKEN`: long-lived Beds24 refresh token used to mint access tokens when `BEDS24_API_TOKEN` is unset or expired
- `CRON_SECRET`: shared secret authorizing **all production cron-backed endpoints**, currently two: the Beds24 reconciliation endpoint (`/api/beds24/reconcile`) and the Todo / Shared Task reminder endpoint (`/api/tasks/reminders`). Vercel Cron automatically sends it as `Authorization: Bearer <CRON_SECRET>` when this var is set on the project. Set it in Vercel project env so **both** daily crons are authorized — if it is unset, the reminder endpoint returns 404 and the reconcile endpoint falls back to `BEDS24_WEBHOOK_SECRET` only. (`BEDS24_WEBHOOK_SECRET` is also accepted by the reconcile endpoint for manual triggers; the reminders endpoint accepts `CRON_SECRET` only.)
- Existing Beds24-linked properties can be backfilled locally through `POST /api/dev/beds24/backfill-inventory`
  - requires `ENABLE_LOCAL_DEV_TOOLS=true`
  - requires localhost access
  - requires the same `BEDS24_WEBHOOK_SECRET` value in `x-beds24-webhook-secret`
  - helper script: `scripts/dev/beds24-backfill-inventory.sh`

Reconciliation safety net (production):

- `GET/POST /api/beds24/reconcile` re-pulls the operational window (**current month + next two months**, 3 months total, widened 2026-07-17) from Beds24 `/bookings` and upserts anything missing. The window is keyed by **arrival/stay overlap, never by booking date** — a reservation booked long ago whose check-in falls in the window is still pulled. It is the production-safe, idempotent counterpart to the dev-only `backfill-reservations` route. That dev route now also accepts `from`/`to` (YYYY-MM-DD) query params for a one-time **wide catch-up** of far-future reservations the narrow window never reaches (used 2026-07-17 to seed 2026-06 → 2027-12).
- Driven daily by Vercel Cron (`vercel.json`, `0 19 * * *` UTC = 04:00 Asia/Tokyo). Webhooks remain the primary update path; this only heals dropped/never-delivered webhook events.
- Every run (and every inbound webhook) is logged to `beds24_webhook_events` for observability.
- Manual trigger: `curl "$APP_URL/api/beds24/reconcile" -H "Authorization: Bearer $CRON_SECRET"` (or `-H "x-beds24-webhook-secret: $BEDS24_WEBHOOK_SECRET"`).

Task reminder cron (production):

- `GET/POST /api/tasks/reminders` first materializes recurring Todo / Shared Task instances for the active task window, then evaluates time-based notifications and fans out one deduped reminder per task per recipient. Due-soon = active task due today (Asia/Tokyo); overdue = active task due before today. It is org-scoped and participant-only. See `src/lib/notifications/task-reminders.ts` and `docs/product/14-notification-design.md`.
- Driven daily by Vercel Cron (`vercel.json`, `0 23 * * *` UTC = 08:00 Asia/Tokyo). Authorized with `CRON_SECRET` only (returns 404 if `CRON_SECRET` is unset, 403 if the secret is missing/wrong).
- Requires the `task_due_soon` / `task_overdue` enum values from `supabase/migrations/202606110001_task_reminder_notifications.sql` (**applied to the linked project on 2026-06-11**); if a fresh environment lacks them, reminder inserts fail soft (logged, no crash) until applied.
- Manual trigger: `curl "$APP_URL/api/tasks/reminders" -H "Authorization: Bearer $CRON_SECRET"`.

Token scope checklist (must verify on token create/refresh):

- bookings
- bookings-personal
- inventory
- properties
- Allow linked properties (linked properties access is not guaranteed by default)

Validation checkpoints (recommended after token update):

- `GET /v2/properties?includeAllRooms=true` returns expected linked properties.
- Current-month overlap bookings query returns reservations for linked properties.
- If not, check token scope first before debugging app code paths.

Important:

- Avoid frequent polling.
- Prefer webhook updates.
- Keep access/refresh tokens server-only.

## Web Push

Required for PWA push notifications:

```txt
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

Usage:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: browser subscription
- `VAPID_PRIVATE_KEY`: server-only push signing
- `VAPID_SUBJECT`: contact subject, usually mailto or URL

Example subject:

```txt
mailto:admin@example.com
```

## Daily Report (Todo 완료/기록 tab)

No environment variable required. The daily work-report generator
(`generateDailyReport` in `src/app/mobile/tasks/report-actions.ts`) is **template-based and free** —
it builds the report deterministically from the day's completed tasks with a local text tidy-up
(whitespace, bullet glyphs, punctuation spacing). No external API or key, no per-use cost.

> History: an LLM-backed version (`@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`, `claude-haiku-4-5`) was
> prototyped but replaced with the free template approach (2026-06-13). If richer 맞춤법 correction is
> ever wanted, re-introducing the SDK + key behind the same `generateDailyReport` contract is the
> upgrade path.

## Storage

Active Supabase Storage buckets:

```txt
announcement-images  -- announcement image uploads (live, RLS enforced)
request-images       -- lost-item and maintenance-report image uploads (live)
```

Planned (not yet created):

```txt
profile-photos       -- user profile photos (deferred to post-MVP)
```

### announcement-images bucket

The `announcement-images` bucket is live. Its Storage RLS INSERT policy enforces:

- Path structure: `{organizationId}/{announcementId}/{filename}` — exactly 3 segments.
- Both `organizationId` and `announcementId` must be valid UUIDs.
- `filename` must be 3-160 characters, start and end with an alphanumeric character, and use only letters, digits, `_`, `.`, `-`.
- Platform admins can upload to any valid organization folder.
- Active non-part-time members can upload only to their own organization's folder.

Policy migrations:

- `supabase/migrations/202605170001_announcement_images_upload_policy.sql` — initial policy
- `supabase/migrations/202605190001_harden_announcement_images_rls.sql` — corrective: full 3-segment path validation
- `supabase/migrations/202605190002_restrict_announcement_image_filenames.sql` — corrective: stricter safe filename validation

Recommended storage path pattern:

```txt
{organization_id}/{target_type}/{target_id}/{attachment_id}.{ext}
```

Profile photo path:

```txt
profiles/{user_id}/{file_id}.{ext}
```

## Vercel

Vercel environments:

- Development
- Preview
- Production

Required:

- Add all production-safe variables to Vercel environment settings.
- Keep server secrets unavailable to client bundle.

## Initial `.env.example` Draft

```txt
NEXT_PUBLIC_APP_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

BEDS24_WEBHOOK_SECRET=
BEDS24_API_BASE_URL=
BEDS24_API_TOKEN=
BEDS24_API_REFRESH_TOKEN=
CRON_SECRET=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

## Supabase Migration CLI

### Authentication requirement

Supabase CLI commands that interact with the linked project require Supabase API authentication. Use one of these approaches:

```powershell
npx supabase login
```

This opens a browser for one-time authentication and stores the access token in `~/.supabase/access-token`.

For short-lived automation, set `SUPABASE_ACCESS_TOKEN` in the current shell instead of storing a login token. Never commit tokens or paste them into documentation.

Database operations may also require the remote Postgres password through `-p <db-password>`. The access token authenticates the Supabase API request; the database password authenticates the remote Postgres connection.

### Migration history status (current as of 2026-06-03)

All local migration files match remote history. The original 18-file reconciliation (2026-05-17/19) has since grown to 37 files with Phase 7-13 implementation.

**Local migration files (37 total):**

```txt
-- Foundation placeholders (comment-only, match remote history)
20260508190109_remote_history_placeholder.sql
20260508191844_remote_history_placeholder.sql
20260509165916_remote_history_placeholder.sql
20260509174644_remote_history_placeholder.sql
20260510135642_remote_history_placeholder.sql
20260510144012_remote_history_placeholder.sql

-- Core foundation (applied via repair)
202605090001_initial_foundation.sql
202605090002_api_grants.sql

-- Announcements (applied via repair)
202605100001_announcements.sql
202605100002_announcement_reads.sql
202605100003_announcement_images.sql
202605100004_announcement_comments.sql
202605110001_announcement_popup_dismissals.sql

-- Announcement hardening
202605160001_harden_announcement_popup_dismissals.sql
202605160002_harden_announcement_manage_rls.sql
202605170001_announcement_images_upload_policy.sql
202605190001_harden_announcement_images_rls.sql
202605190002_restrict_announcement_image_filenames.sql

-- Cleaning workflow (Phase 7)
202605210001_cleaning_sessions.sql
202605210002_correct_cleaning_operating_date_and_active_index.sql
202605210003_allow_owner_mobile_cleaning_qa.sql
202605210004_allow_admin_qa_mobile_cleaning.sql
202605210005_owner_field_hybrid_cleaning_access.sql

-- Requests (Phase 8)
202605210006_lost_items.sql
202605210007_maintenance_reports.sql
202605210008_request_images.sql

-- Reservation calendar (Phase 10)
202605220001_reservations.sql
202605240001_properties_rooms.sql
202605240002_beds24_sync_indexes.sql
202605240003_beds24_property_external_key.sql
202605260002_enable_reservations_realtime.sql

-- Order requests (Phase 8 order slice)
202606010001_order_requests.sql
202606010002_order_requests_delivery_date.sql
202606020001_order_requests_delivery_range.sql

-- Notifications (Phase 11)
202606030001_notifications.sql
```

**Verified at 2026-06-03:** All 37 migrations confirmed applied on remote Supabase project `sspdgzkytkpmquqsfaup` via MCP migration list check.

### Adding new migrations

History is reconciled. The normal workflow applies from this point:

1. Create a new file in `supabase/migrations/` using the naming convention `YYYYMMDDNNNN_description.sql`
2. Run: `npx supabase db push -p <db-password>`
3. Verify with: `npx supabase migration list -p <db-password>`

Run the commands after Supabase API authentication is available through `npx supabase login` or `SUPABASE_ACCESS_TOKEN`. Use `-p <db-password>` when the CLI asks for the remote Postgres password.

## Open Questions

- Will Google OAuth be configured only in Supabase dashboard?
- What exact Beds24 webhook verification mechanism will be used?
- Will Web Push be included in the first internal MVP or added after in-app notifications?
- What email/contact should be used for `VAPID_SUBJECT`?
## Reservation Calendar Flags

### `BEDS24_SYNC_PAUSED`

- Default when unset: `true` (paused). The app treats Beds24 sync as paused unless explicitly disabled.
- Set to one of `0`, `false`, `off`, or `no` to re-enable webhook/reconcile processing.
- **Production activated 2026-07-17:** the Vercel production project now sets `BEDS24_SYNC_PAUSED=false`,
  so live webhooks (all 8 linked properties) and the daily reconcile cron are active. The stale
  `BEDS24_API_TOKEN` was removed so the app mints access tokens from `BEDS24_API_REFRESH_TOKEN`.
- Used by:
  - `src/app/api/beds24/webhook/route.ts`
  - `src/app/api/beds24/reconcile/route.ts`
  - admin reservation calendar sync status chip
