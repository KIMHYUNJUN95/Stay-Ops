# Announcement Workflow

## Purpose

Announcements are used for internal company notices, operational updates, building-specific instructions, and important information that staff must read.

## Write Permission

All roles except Part-time Staff can create announcements.

Can create:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff

Cannot create:

- Part-time Staff

## Read Permission

Users can read announcements that target them.

Announcements can target:

- Everyone
- Specific property/building
- Specific role
- Combination of property/building and role

Current implementation:

- Everyone
- Specific role
- Property/building targeting remains deferred until property setup exists.

## Required Fields

Announcement fields:

```txt
id
organization_id
title
content
image_urls
created_by_user_id
target_scope
target_property_ids
target_roles
is_important
is_pinned
show_popup_on_app_open
popup_until
allow_comments
created_at
updated_at
published_at
archived_at
```

Implementation note:

- The first implementation migration is `supabase/migrations/202605100001_announcements.sql`.
- `/admin/announcements` now supports announcement creation and status management.
- `/admin/announcements` now supports announcement deletion for allowed users.
- Deletion now goes through a confirmation modal before the server action runs.
- `/admin/announcements/[id]` now provides the first admin read/detail screen.
- `/mobile/announcements` now provides the first read-only mobile announcement list for published announcements visible to the current user.
- `/mobile/announcements/[id]` now provides the first read-only mobile announcement detail screen.
- `supabase/migrations/202605100002_announcement_reads.sql` adds persistent announcement read confirmations.
- `supabase/migrations/202605100003_announcement_images.sql` adds `announcements.image_urls` and the public `announcement-images` Storage bucket.
- `supabase/migrations/202605100004_announcement_comments.sql` adds `announcement_comments`.
- Admin and mobile users are marked as read automatically when they open a visible published announcement detail screen.
- Admin announcement detail now shows clickable read/unread counts and opens the first user list modal for the announcement target audience.
- Admin announcement creation now supports up to 5 image attachments.
- Admin and mobile announcement detail screens now display attached images.
- Admin and mobile announcement popups now display attached images.
- Admin and mobile announcement detail screens now display announcement comments and support comment submission when comments are enabled.
- Comment authors can edit or delete their own comments from both admin and mobile announcement detail screens.
- Comment edit/delete ownership and announcement visibility are verified by server actions before data is changed.
- Images are uploaded directly from the browser to Supabase Storage using the anon key and a Storage RLS INSERT policy; no Server Action body size limit applies.
- The first version stores title, content, organization, author, target scope, target roles, status, important flag, pinned flag, popup flag, comments flag, published date, archived date, and timestamps.
- Published popup-enabled announcements now show as a dismissible popup on the admin announcement screen.
- Published popup-enabled announcements now also show as a dismissible popup on the mobile announcement list screen for targeted users.
- Mobile announcement list/detail/popup presentation was refreshed on 2026-05-20 to match the latest design references (section-based list cards, cardized detail content blocks, attachment strip emphasis, and centered modal popup CTA stack for detail/read actions) while keeping existing data and permission behavior unchanged.
- Admin announcement list/detail presentation was refreshed on 2026-05-20 with a quieter operational dashboard style: cleaner create form, status/target/author/date metadata, thumbnail previews, improved empty state, detail summary cards, content and attachment sections, read status panel hierarchy, and comments polish. Existing data, permissions, read tracking, popup dismissal, upload, and cleanup behavior remain unchanged.
- Final announcement design polish completed on 2026-05-21 across mobile list/detail, admin list/detail, shared popup, comments, read-status panel, attachment presentation, and empty states. The Figma-alignment refinement tightened section rhythm, card proportions, metadata wrapping, modal hierarchy, attachment framing, and long-content behavior. Mobile list cards show each announcement's non-deleted comment count beside the target indicator. Empty states and long titles/body text/author names/role target lists were reviewed for graceful wrapping. This pass did not change permissions, read tracking, popup dismissal, upload, cleanup, or server action semantics.
- Client-side image compression and individual removal are now implemented in `AnnouncementImageUploader`.
- Admin announcement detail access is restricted to the announcement's organization; only active memberships with an admin-web-capable role (owner, office_admin, cs_staff) are permitted.
- Announcement status changes and deletion verify the user's current role in the announcement's organization: owner/office_admin can manage all announcements, and authors can manage their own announcements only while they still have an active non-part-time membership.
- Announcement creation verifies the current user's membership in the selected organization, avoiding cross-organization role leakage for users who belong to multiple organizations.
- Admin list status/delete controls are shown only when the current user can manage that specific announcement.
- Announcement deletion now removes attached Storage images after the DB row is deleted. Cleanup only targets current Supabase project URLs in the `announcement-images` bucket.
- Property targeting remains deferred until property setup is added.
- Direct Supabase Storage upload is implemented as of `202605170001_announcement_images_upload_policy.sql`.

## Image Attachments

Announcements can include images.

Limit:

- Maximum 5 images per announcement

Images should be compressed before upload.

Recommended compression:

- Resize long edge to max 1600px.
- Use JPEG/WebP compression around 70-80% quality.

Current implementation:

- Images are stored in the public `announcement-images` Supabase Storage bucket.
- The first version accepts JPEG, PNG, WebP, and GIF images.
- Maximum upload is 5 images per announcement.
- Each image must be 8MB or less.
- Images are uploaded directly from the browser to Supabase Storage using the anon key and a Storage RLS INSERT policy (`202605170001`), bypassing the Server Action body size limit entirely. The 50MB Server Action body size override has been removed from `next.config.ts`.
- Client-side compression is implemented before upload: JPEG, PNG, and WebP images are resized to a maximum of 1600px on the long edge and compressed at quality 0.75. GIF images are passed through without compression to preserve animation.
- Images can be individually removed from the selection before submission.
- After all images are uploaded, the client passes the resulting public URLs and a client-generated announcement UUID to the `createAnnouncement` server action.
- The server action validates each URL against the Supabase project hostname, the `announcement-images` bucket, and a three-segment path matching `{orgId}/{announcementId}/{safeFilename}` before inserting the DB row.
- The Storage INSERT policy is hardened by corrective migrations `202605190001` and `202605190002` (pushed to remote 2026-05-19): object names must use exactly three segments, both ID segments must be UUIDs, and filenames must be bounded safe basenames that start and end with an alphanumeric character.
- If validation, permission, or DB insert fails, the server action removes structurally valid uploaded images using the service role client, but only while the submitted announcement ID has not been persisted.
- Orphan images (uploaded but never saved ??e.g., user closes the tab mid-submission) are addressed by the `purgeOrphanAnnouncementImages` platform-admin-only server action. The action traverses the bucket hierarchy, applies a 60-minute grace period to avoid deleting files from in-progress submissions, cross-references all DB announcement `image_urls`, and deletes only unreferenced files that are older than the grace period. The trigger button appears at the bottom of `/admin/announcements` for platform admins only. Folder traversal is limited to 500 entries per level (sufficient for MVP scale).
- If any Storage listing step fails while checking the org, announcement, or file level, orphan cleanup aborts before any deletion. The action returns explicit failure fields (`ok: false`, `aborted: true`, `errorMessage`, `listingFailures`), and the admin UI shows a destructive alert. This avoids the silent-failure risk where a partial listing causes known-orphan files to be skipped while unknown ones are deleted.
- `updateAnnouncementStatus` and `deleteAnnouncement` now validate `announcementId` as a UUID before performing the DB lookup, consistent with the guard in `createAnnouncement`.

## Read Tracking

Read confirmation is required.

The system should track:

```txt
announcement_id
user_id
read_at
```

Admin users should be able to see who has read or not read important announcements.

Current implementation:

- `announcement_reads` stores one read record per announcement and user.
- The first read time is preserved by the unique `(announcement_id, user_id)` pair.
- Admin and mobile announcement detail now record read status automatically on open.
- Admin announcement detail shows read/unread counts and lets operators open read/unread user lists with role and read-time detail.

## Important and Pinned Announcements

Important announcement:

- Visually highlighted
- Can trigger stronger notification behavior

Pinned announcement:

- Stays at the top of the announcement list

These should be separate flags.

## App Open Popup

Announcement creator can choose whether an announcement appears as a popup when users open the app.

Popup behavior:

- Only shown to targeted users
- Can be configured per announcement
- Should not show forever after user confirms/read, unless designed as mandatory repeat

Current implementation:

- Admin announcement screen shows published popup-enabled announcements as a dismissible popup, filtered to announcements that target the current user.
- Mobile announcement list screen shows published popup-enabled announcements as a dismissible popup, filtered to announcements that target the current user.
- Users can dismiss a popup just for the current session (local only), or hide the same popup for 7 days with the checkbox in the popup footer.
- The 7-day hide preference is stored server-side in `announcement_popup_dismissals` (one row per user x announcement), persisting across all browsers and devices.
- Pages pre-filter popup candidates using server-side dismissal records before rendering, so dismissed popups never flash on page load from any device.
- Local browser storage is kept as a same-page fast path to hide the popup immediately after dismiss without waiting for a full page reload.
- Popup hide tracking is separate from `announcement_reads`; reading a detail page does not auto-dismiss the popup, and dismissing a popup does not mark the announcement as read.
- The shared popup detail CTA resolves per surface: mobile opens `/mobile/announcements/[id]`, and admin opens `/admin/announcements/[id]`.
- The popup secondary CTA is a close/dismiss action, not a read-tracking action. Read tracking remains tied to opening the detail page.
- The mobile popup is presented as a centered modal with a dimmed/blurred backdrop, important header, preview card, full-width detail/close CTAs, and the existing 7-day hide checkbox.
- Property targeting remains deferred until property setup exists.

Open decision:

- Should popup disappear forever after first read?
- Should important popup repeat until user taps "read/confirmed"?

## Comments

Comments are allowed on announcements.

Comment permission follows announcement visibility:

- If the announcement targets everyone, everyone can comment.
- If the announcement targets specific roles/properties, targeted users can comment.

Comment fields:

```txt
id
organization_id
announcement_id
user_id
content
created_at
updated_at
deleted_at
```

Open decision:

- Should comments support images?
- Should announcement author be able to close comments later if needed?

Current implementation:

- Comments are stored in `announcement_comments`.
- Admin and mobile announcement detail screens both show the same comment thread.
- Only published announcements with `allow_comments = true` accept new comments.
- Users can edit or delete only comments they authored and can still access through announcement visibility rules.
- Comment deletion is currently a soft delete using `deleted_at`.
- Comment image attachments remain deferred.

## Notifications

Potential notification triggers:

- New important announcement
- New announcement targeted to user
- Popup announcement published
- Comment added to announcement

## Open Questions

- Should Staff be allowed to publish to everyone, or only to their property/role?
- Should announcements require approval before publishing?
- Should popup announcements be mandatory confirmation notices?
- Should read tracking apply to all announcements or only important ones?

## 2026-05-21 Cross-Module Note

- Request modules (`lost_items`, `maintenance_reports`) now follow the same direct-upload pattern used by announcements:
  - Browser upload to Supabase Storage (`request-images` bucket)
  - Server-side URL/path validation on create action (4-segment path: `{orgId}/{requestType}/{requestId}/{filename}`)
  - Max 5 images per request record
  - Mobile detail pages (`/mobile/requests/lost-found/[id]`, `/mobile/requests/maintenance/[id]`) display attached images via `AnnouncementImageGrid`
  - Image upload labels are localized through `dictionary.requestImages` (ko/ja/en) ??no hardcoded visible strings in form components

## 2026-05-22 UI Consistency Note

- Mobile announcement surfaces are now fully aligned to the current mobile shell visual rules:
  - `/mobile/announcements` list cards follow the same liquid-glass spacing and metadata hierarchy.
  - `/mobile/announcements/[id]` detail cards and read block use the same surface rhythm.
  - The centered popup modal keeps the same CTA hierarchy and spacing conventions.

