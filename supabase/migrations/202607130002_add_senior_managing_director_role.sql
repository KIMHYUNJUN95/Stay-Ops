-- Phase 2 of the 2026-07-13 user/permission model rework (docs/planning/01-decision-log.md).
--
-- Add the `senior_managing_director` (전무) organization role. Confirmed direction: 전무 is treated as
-- FULLY owner-equivalent (every permission), and is the default annual-leave approver.
--
-- This migration ONLY adds the enum value. Making it owner-equivalent in RLS is done in the NEXT
-- migration (202607130003), which recreates `has_org_role` — the enum value must be committed before a
-- function can reference it, so it lives in its own migration.
alter type public.organization_role add value if not exists 'senior_managing_director';
