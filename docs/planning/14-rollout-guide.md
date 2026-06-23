# Internal Rollout Guide

This guide covers the steps to deploy StayOps for the first group of internal staff.  
For the QA checklist and release-readiness summary, see `docs/planning/13-qa-checklist.md`.

---

## Before You Start

Complete these steps before inviting any staff.

### 1. Apply room master backfill (required for accurate calendar)

The reservation calendar shows a provisional empty-count warning until the room master is populated from Beds24.

```bash
# Run from the project root on a machine with .env.local configured
bash scripts/dev/beds24-backfill-room-master.sh
```

After this runs, the amber warning on `/mobile/calendar` disappears and empty-count becomes authoritative.

If the script is not available in the deployment environment, trigger it via the dev API:

```bash
curl -X POST https://<your-domain>/api/dev/beds24/backfill-room-master \
  -H "x-beds24-webhook-secret: <BEDS24_WEBHOOK_SECRET>"
```

Note: this endpoint is gated by `ENABLE_LOCAL_DEV_TOOLS=true` and localhost guards. Adjust access policy if needed for a production trigger.

### 2. Verify remote DB migrations are current

All migrations should already be applied. Confirm by checking Supabase → Database → Migrations in the dashboard, or by running:

```bash
supabase db push --dry-run
```

Expected: no pending migrations. The last applied migration should be `202606030001_notifications`.

### 3. Verify Beds24 webhook is configured

In Beds24 → Settings → API → Webhooks, the webhook URL should point to:

```
https://<your-domain>/api/beds24/webhook
```

With the `BEDS24_WEBHOOK_SECRET` value matching your `.env` / Vercel environment variable.

Test by triggering a booking change in Beds24 and checking `/admin/calendar` for the update.

### 4. Deploy latest code to Vercel

Push or merge the current branch to the deployment branch. Vercel will rebuild automatically.

```bash
git push origin main
```

Verify the Vercel deployment completes without build errors.

---

## Creating Invite Codes

Go to `/admin/settings/invite-codes` (requires `owner` or `office_admin` role).

1. Click **Create invite code**.
2. Enter a **display name** (for your reference, e.g. "Field Staff May 2026").
3. Enter the actual **code** users will type (e.g. `FIELDTEAM2026`). Keep it short and easy to type on mobile.
4. Select **role**: `staff` for regular field staff, `part_time_staff` for part-time.
5. Click **Create**.

Repeat for each role group. You can create multiple codes — one per team or shift is fine.

Share codes directly with staff (e.g. LINE, Slack, in person). Codes are not time-limited by default but can be deactivated at any time.

---

## Staff Onboarding Flow

Each staff member follows this flow on first use:

1. Open the StayOps URL in their browser on their phone.
2. **Install as PWA** (optional but recommended):
   - iOS Safari: tap the Share icon → "Add to Home Screen"
   - Android Chrome: tap the menu → "Add to Home Screen" or "Install app"
3. Enter their **work email** on the login screen and tap **Send magic link**.
4. Open the email and tap the link. This returns them to the app.
5. Complete the **onboarding form**: enter name, phone number, preferred language.
6. Enter the **invite code** they received.
7. They land on the **Home** screen.

If a staff member gets stuck on step 6, confirm the invite code is active at `/admin/settings/invite-codes`.

---

## Role Reference

| Role | Mobile access | Admin web access |
|---|---|---|
| `owner` | Full mobile + cleaning | Full admin web |
| `office_admin` | Full mobile | Full admin web |
| `field_manager` | Full mobile | Cleaning + requests |
| `cs_staff` | Full mobile | Announcements + read-only |
| `staff` | Full mobile | None |
| `part_time_staff` | Cleaning + announcements | None |

Part-time staff cannot see requests, orders, or the calendar tab.

---

## Key URLs for Staff

| Page | URL | Who uses it |
|---|---|---|
| Home | `/mobile` | All mobile users |
| Calendar | `/mobile/calendar` | All mobile users |
| Cleaning | `/mobile/cleaning` | Field staff |
| Requests | `/mobile/requests` | All mobile users |
| Order new | `/mobile/orders/new` | All mobile users |
| Announcements | `/mobile/announcements` | All mobile users |
| Notifications | `/mobile/notifications` | All mobile users |
| Directory | `/mobile/directory` | All mobile users |
| Account | `/account` | All users |

Admin web (for office/admin staff):

| Page | URL |
|---|---|
| Dashboard | `/admin` |
| Calendar | `/admin/calendar` |
| Orders | `/admin/orders` |
| Cleaning records | `/admin/cleaning` |
| Lost and found | `/admin/lost-found` |
| Maintenance | `/admin/maintenance` |
| Announcements | `/admin/announcements` |
| Users | `/admin/users` |
| Settings | `/admin/settings/organization` |
| Invite codes | `/admin/settings/invite-codes` |

---

## First-Week Operational Checklist

After inviting the first staff batch, verify these within the first week:

- [ ] At least one field staff member has completed onboarding and reached the Home screen.
- [ ] A cleaning session has been started and completed successfully.
- [ ] An order request has been created, approved, and processed by an admin.
- [ ] The requester received an in-app notification after the order was processed.
- [ ] A reservation appears in `/mobile/calendar` after a Beds24 booking event.
- [ ] An announcement has been published and a staff member has confirmed seeing it.
- [ ] CSV export downloads correctly from `/admin/orders` (or another export page).

---

## Troubleshooting

### Calendar shows no reservations

1. Check that the Beds24 webhook is configured and pointing to the correct URL.
2. Run the reservation backfill: `POST /api/dev/beds24/backfill-reservations`.
3. Check Supabase logs for webhook errors.

### Notification not appearing after order processed

1. Confirm `202606030001_notifications.sql` is applied to the remote DB.
2. Check Supabase logs for `[notifications] create failed` or `table not available` warnings.
3. If the table is missing, apply the migration via Supabase Dashboard → SQL editor.

### Staff cannot join with invite code

1. Go to `/admin/settings/invite-codes` and confirm the code is active (not deactivated).
2. Ask the staff member to type the code exactly as shown (case-sensitive).
3. If the code was deactivated, create a new one.

### "Empty today" amber warning in calendar

This is expected until the room master backfill has been run. See step 1 of "Before You Start" above.

### Staff cannot access admin web

Check the user's role at `/admin/users`. `staff` and `part_time_staff` roles do not have admin web access. Promote to `cs_staff` or higher if admin web access is needed.

---

## Post-Rollout Known Gaps

These are intentional MVP limitations that do not block internal use:

- Google OAuth is implemented; requires Supabase dashboard → Authentication → Providers → Google to be enabled with a client ID and client secret before staff can use the Google sign-in button.
- Calendar empty count requires manual backfill to be authoritative (not automatic from webhook).
- Map tab shows building cards with address and access codes but no embedded map.

These will be addressed in the post-MVP cycle.
