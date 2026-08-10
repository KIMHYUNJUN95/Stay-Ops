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

#### Sample data — linen returns (`scripts/dev/seed-linen-returns.js`)

Creates sample 린넨 반품 records so `/admin/linen-return` has something to look at. It reads the
organization's real building catalog, active `linen_items`, and active members, then writes records
across the current Tokyo month plus two in the previous month (for range-filter checks). Notes are
prefixed with `[샘플]` so seeded rows are easy to spot and delete from the console. Photos are not
seeded (they would need real storage objects). Uses `SUPABASE_SERVICE_ROLE_KEY` — **local only**.

```bash
node scripts/dev/seed-linen-returns.js                  # dry run (prints the plan, writes nothing)
node scripts/dev/seed-linen-returns.js --apply          # first organization
node scripts/dev/seed-linen-returns.js --apply --org <organization_id>
```

Delete seeded rows from the console UI (삭제 → 확인), or by the `[샘플]` note prefix.

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
- `DEEPL_API_KEY`: DeepL API key used to translate external reviews on demand. **Server-only** — never expose it to the browser. Optional: without it the review detail simply offers no translate button and the original text still renders. Free-tier keys end in `:fx`; the host is picked automatically (`api-free.deepl.com` vs `api.deepl.com`), or override with `DEEPL_API_URL`. Usage is capped in code at 450,000 characters per calendar month against DeepL API Free's 500,000 so a burst cannot overshoot the free tier. See `docs/product/25-complaint-workflow.md` → "Review Translation".
- `CRON_SECRET`: shared secret authorizing production scheduled/maintenance endpoints: Beds24 reconcile,
  external-review sync/health/relink, Todo reminders, and attendance reminders. Vercel sends it
  automatically only to routes declared in `vercel.json`; GitHub Actions and manual callers send the
  bearer header (Beds24 paths also accept `BEDS24_WEBHOOK_SECRET` where documented). An unset reminder
  secret returns 404; invalid/missing caller credentials return 403.
- Existing Beds24-linked properties can be backfilled locally through `POST /api/dev/beds24/backfill-inventory`
  - requires `ENABLE_LOCAL_DEV_TOOLS=true`
  - requires localhost access
  - requires the same `BEDS24_WEBHOOK_SECRET` value in `x-beds24-webhook-secret`
  - helper script: `scripts/dev/beds24-backfill-inventory.sh`
- External reviews can be collected locally through `GET/POST /api/dev/beds24/sync-reviews`
  - same gate as the other dev routes: `ENABLE_LOCAL_DEV_TOOLS=true`, localhost only, `BEDS24_WEBHOOK_SECRET` in `x-beds24-webhook-secret`
  - `organizationId` (UUID) is **required**; optional `sinceDays` (1–365, default 90)
  - production counterpart: `/api/beds24/reviews-sync` (see below)

Reconciliation safety net (production):

- `GET/POST /api/beds24/reconcile` re-pulls the operational window (**current month + next two months**, 3 months total, widened 2026-07-17) from Beds24 `/bookings` and upserts anything missing. The window is keyed by **arrival/stay overlap, never by booking date** — a reservation booked long ago whose check-in falls in the window is still pulled. It is the production-safe, idempotent counterpart to the dev-only `backfill-reservations` route. That dev route now also accepts `from`/`to` (YYYY-MM-DD) query params for a one-time **wide catch-up** of far-future reservations the narrow window never reaches (used 2026-07-17 to seed 2026-06 → 2027-12).
- Driven by Vercel Cron (`vercel.json`, `0 19 * * *` UTC) **and** — since 2026-07-22 — an independent
  GitHub Actions schedule (`.github/workflows/beds24-reconcile.yml`, every 6h). Webhooks remain the primary
  update path; this only heals dropped/never-delivered webhook events.
- **Why two triggers (2026-07-22):** the Vercel cron was found to have silently stopped firing for days
  (0 invocations for both crons — a Vercel-side scheduling failure, not code/token: the endpoint returns
  HTTP 200 when hit manually). The GitHub Actions schedule is a redundant external trigger that does not
  depend on Vercel's cron scheduler, so the safety net survives a broken Vercel cron. reconcile is
  idempotent, so running from both is harmless. **Required GitHub repo secret:** `BEDS24_WEBHOOK_SECRET`
  (same value as on Vercel) — set it under repo Settings → Secrets and variables → Actions.
- Every run (and every inbound webhook) is logged to `beds24_webhook_events` for observability.
- Manual trigger: `curl "$APP_URL/api/beds24/reconcile" -H "Authorization: Bearer $CRON_SECRET"` (or `-H "x-beds24-webhook-secret: $BEDS24_WEBHOOK_SECRET"`).

Webhook ingestion hardening (2026-07-22):

- The webhook endpoint (`/api/beds24/webhook`) previously rejected any delivery whose
  booking record it could not locate with a bare **HTTP 400, before writing any
  observability row** — so a run of unrecognized deliveries went silently missing. Fixed:
  1. **Defensive body parsing** — the raw body is read once and parsed as JSON *or*
     `application/x-www-form-urlencoded` (a form field whose value is itself JSON is unwrapped),
     so a delivery is never dropped merely for its transport encoding.
  2. **Envelope-agnostic extraction** — `extractBeds24WebhookBookingCandidates` now recurses
     into *every* nested object/array (bounded depth), so a booking wrapped under any envelope
     key (`booking`, `data`, `bookings`, …) is still found; duplicates are de-duped by booking id.
  3. **No silent drops, ever** — when no booking can be extracted, the full raw body +
     `Content-Type` are persisted to `beds24_webhook_events` (`raw_payload` / `content_type`
     columns, migration `202607220001_beds24_webhook_raw_capture.sql`) with mode
     `no_booking_candidates`, and the endpoint **ACKs 2xx** so Beds24 does not retry-storm. The
     daily reconcile still heals the missed reservation from the Beds24 API. Partially-failed
     batches likewise keep their raw body for replay/debug.
- `raw_payload` is captured **only** for failed/unparsed deliveries (the case that needs
  debugging), not for every successful booking, keeping bulk guest PII out of the log.

Task reminder cron (production):

- `GET/POST /api/tasks/reminders` first materializes recurring Todo / Shared Task instances for the active task window, then evaluates time-based notifications and fans out one deduped reminder per task per recipient. Due-soon = active task due today (Asia/Tokyo); overdue = active task due before today. It is org-scoped and participant-only. See `src/lib/notifications/task-reminders.ts` and `docs/product/14-notification-design.md`.
- Driven daily by Vercel Cron (`vercel.json`, `0 23 * * *` UTC = 08:00 Asia/Tokyo). Authorized with `CRON_SECRET` only (returns 404 if `CRON_SECRET` is unset, 403 if the secret is missing/wrong).
- Requires the `task_due_soon` / `task_overdue` enum values from `supabase/migrations/202606110001_task_reminder_notifications.sql` (**applied to the linked project on 2026-06-11**); if a fresh environment lacks them, reminder inserts fail soft (logged, no crash) until applied.
- Manual trigger: `curl "$APP_URL/api/tasks/reminders" -H "Authorization: Bearer $CRON_SECRET"`.

External review collection cron (production):

- `GET/POST /api/beds24/reviews-sync` pulls Airbnb / Booking.com reviews from Beds24 into `external_reviews` (pure upsert on `organization_id, provider, external_review_id`). Reviews have no webhook, so this is the one Beds24 read path that must be scheduled. See `docs/engineering/01-beds24-integration.md` → "External Reviews".
- Driven daily by GitHub Actions (`.github/workflows/beds24-reviews-sync.yml`, `5 23 * * *` UTC =
  08:05 Asia/Tokyo). Routine runs use the workflow's rolling window; `?full=1` requests a deeper recovery
  sweep. Optional `?organizationId=<uuid>` limits the run to one org, otherwise active organizations are processed.
- Auth matches the reconcile endpoint: `CRON_SECRET` bearer, falling back to `BEDS24_WEBHOOK_SECRET` (`x-beds24-webhook-secret` header or `?secret=`) for manual triggers. 404 when neither secret is configured, 403 when the provided one is wrong. `BEDS24_SYNC_PAUSED` short-circuits the run with `202 {ok:true,paused:true}`.
- Per-organization failures do not abort the run — they surface in `failures[]` with HTTP 207. The response carries `creditsRemaining` / `stoppedEarly` so a credit-limited early stop is visible; the next cycle resumes the remainder.
- Manual trigger: `curl "$APP_URL/api/beds24/reviews-sync?full=1" -H "Authorization: Bearer $CRON_SECRET"`.

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

### Slack single-channel delivery

Set this server-only variable in local development and the deployed environment:

```txt
SLACK_DAILY_REPORT_WEBHOOK_URL=
```

It must be a Slack Incoming Webhook for the single company daily-report channel. Do not put this URL
in client variables, documentation, source code, or browser logs. The report send action permits only
`https://hooks.slack.com` endpoints, sends the reviewed textarea body unchanged, and rechecks the
existing daily-report permission server-side. Leaving it unset keeps report generation/copy working
and returns a localized "not configured" message for Slack send.

### Slack operator alerts — a *different* channel (2026-08-07)

```txt
SLACK_OPS_ALERT_WEBHOOK_URL=
```

Used only by `src/lib/slack-notify.ts` (currently: the external-review freshness check). **Do not
point this at the daily-report webhook.** That channel is where field staff post work logs; a
"review collection looks stalled" alert there reaches people who cannot act on it and pushes real
logs off screen. Different audience → different channel.

**Optional.** Unset means no Slack message at all — detection still runs and the reconcile workflow
still prints a `::warning::` in its run log. Setting it is opting *in* to an extra alert.

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

## Canonical `.env.example` Shape

```txt
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPPORT_EMAIL=

ENABLE_LOCAL_DEV_TOOLS=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

BEDS24_WEBHOOK_SECRET=
BEDS24_DEFAULT_ORGANIZATION_ID=
BEDS24_API_BASE_URL=
BEDS24_API_TOKEN=
BEDS24_API_REFRESH_TOKEN=
BEDS24_SYNC_PAUSED=
CRON_SECRET=

DEEPL_API_KEY=
DEEPL_API_URL=

SLACK_DAILY_REPORT_WEBHOOK_URL=
SLACK_OPS_ALERT_WEBHOOK_URL=

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

### Migration history snapshot (verified 2026-06-03; historical)

At that date, all 37 local migration files matched the linked remote history. The repository has since
grown substantially (112 local migration files as of 2026-08-07), so this historical list must not be
used to claim that a deployment is current. Run `npx supabase migration list` against the actual target.

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

## Deployment-Specific Decisions

- Confirm the production support email and `VAPID_SUBJECT` before enabling those channels.
- Verify Google OAuth and redirect URLs in the target Supabase project/dashboard.
- Verify both Vercel environment variables and GitHub Actions secrets for scheduled jobs.
- In-app notifications are live; Web Push remains a separately configured delivery channel.
## Reservation Calendar Flags

### `BEDS24_SYNC_PAUSED`

- Default when unset: `false` (active). The app treats Beds24 sync as active unless it is explicitly paused.
- Set to one of `1`, `true`, `on`, or `yes` to pause webhook/reconcile processing.
- **Production activated 2026-07-17:** the Vercel production project now sets `BEDS24_SYNC_PAUSED=false`,
  so live webhooks (all 8 linked properties) and the daily reconcile cron are active. The stale
  `BEDS24_API_TOKEN` was removed so the app mints access tokens from `BEDS24_API_REFRESH_TOKEN`.
- Used by:
  - `src/app/api/beds24/webhook/route.ts`
  - `src/app/api/beds24/reconcile/route.ts`
  - admin reservation calendar sync status chip
## Attendance integrity settings (2026-08-10)

- `ATTENDANCE_MAX_GPS_ACCURACY_METERS` controls the maximum accepted browser geolocation accuracy;
  default is `100` meters when unset.
- `.github/workflows/attendance-reminders.yml` invokes `/api/attendance/reminders` at `09:30 UTC`
  (`18:30 Asia/Tokyo`). Add a GitHub Actions repository secret named `CRON_SECRET` matching production.
- Apply `supabase/migrations/20260810042830_attendance_integrity_hardening.sql` before deploying the
  corresponding server actions, because they call its service-role-only RPC functions.
