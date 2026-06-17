-- Staff Suggestions — atomic author edit (data-integrity fix).
--
-- The author edit flow used to UPDATE the suggestion, then DELETE all references, then re-INSERT the
-- new set as separate statements. If the re-insert failed, the suggestion could lose all references
-- while the edit still reported success. This function does the field update + reference re-sync in a
-- SINGLE transaction (a plpgsql function body is atomic), so a failed insert rolls back the delete and
-- the update together — no silent partial state. It returns the previous reference user_ids so the
-- caller can notify only the newly added ones.
--
-- Authorization (author-only, status = 'submitted') is enforced in the server action BEFORE this is
-- called; this function only performs the write and is granted to service_role only.

create or replace function public.update_staff_suggestion(
  p_id uuid,
  p_org uuid,
  p_title text,
  p_body text,
  p_category text,
  p_recipient uuid,
  p_property_id uuid,
  p_property_name text,
  p_room_id uuid,
  p_room_label text,
  p_image_urls text[],
  p_reference_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  old_refs uuid[];
begin
  update public.staff_suggestions
    set title = p_title,
        body = p_body,
        category = p_category,
        recipient_user_id = p_recipient,
        property_id = p_property_id,
        property_name = p_property_name,
        room_id = p_room_id,
        room_label = p_room_label,
        image_urls = p_image_urls
  where id = p_id and organization_id = p_org;

  select coalesce(array_agg(user_id), '{}'::uuid[]) into old_refs
  from public.staff_suggestion_references
  where suggestion_id = p_id and organization_id = p_org;

  delete from public.staff_suggestion_references
  where suggestion_id = p_id and organization_id = p_org;

  if p_reference_ids is not null and array_length(p_reference_ids, 1) is not null then
    insert into public.staff_suggestion_references (organization_id, suggestion_id, user_id)
    select p_org, p_id, unnest(p_reference_ids);
  end if;

  return old_refs;
end;
$$;

grant execute on function public.update_staff_suggestion(
  uuid, uuid, text, text, text, uuid, uuid, text, uuid, text, text[], uuid[]
) to service_role;
