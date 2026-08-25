-- Upgrade existing installations from the membership-only policies shipped in
-- 0.1.2 to operation-specific authorization and append-only evidence metadata.

create or replace function tek_private.has_tenant_permission(
  target_tenant_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tek_tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.active = true
      and case requested_permission
        -- Preserve the pre-hardening read/create behavior for every active member,
        -- including installations that use application-specific role names.
        when 'evidence.read' then true
        when 'evidence.create' then true
        when 'evidence.delete' then membership.role in ('owner', 'admin')
        else false
      end
  );
$$;

revoke all on function tek_private.has_tenant_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function tek_private.has_tenant_permission(uuid, text)
  to authenticated;

create or replace function tek_private.can_access_object(
  object_name text,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    tek_private.has_tenant_permission(
      tek_private.object_tenant_id(object_name),
      requested_permission
    ),
    false
  );
$$;

revoke all on function tek_private.can_access_object(text, text)
  from public, anon, authenticated;
grant execute on function tek_private.can_access_object(text, text) to authenticated;

revoke update on public.tek_evidence from anon, authenticated;

drop policy if exists "tenant members can read evidence" on public.tek_evidence;
create policy "tenant members can read evidence"
on public.tek_evidence
for select
to authenticated
using (tek_private.has_tenant_permission(tenant_id, 'evidence.read'));

drop policy if exists "tenant members can insert evidence" on public.tek_evidence;
create policy "tenant members can insert evidence"
on public.tek_evidence
for insert
to authenticated
with check (
  tek_private.has_tenant_permission(tenant_id, 'evidence.create')
  and (actor_user_id is null or actor_user_id = (select auth.uid()))
);

drop policy if exists "tenant members can delete evidence metadata" on public.tek_evidence;
create policy "tenant members can delete evidence metadata"
on public.tek_evidence
for delete
to authenticated
using (tek_private.has_tenant_permission(tenant_id, 'evidence.delete'));

drop policy if exists "tenant members can upload evidence objects" on storage.objects;
create policy "tenant members can upload evidence objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.create')
);

drop policy if exists "tenant members can read evidence objects" on storage.objects;
create policy "tenant members can read evidence objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.read')
);

drop policy if exists "tenant members can delete evidence objects" on storage.objects;
create policy "tenant members can delete evidence objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.delete')
);

-- The old one-argument helper is no longer referenced after all Storage policies
-- have been replaced. Removing it prevents future policies from accidentally
-- falling back to membership-only authorization.
drop function if exists tek_private.can_access_object(text);
