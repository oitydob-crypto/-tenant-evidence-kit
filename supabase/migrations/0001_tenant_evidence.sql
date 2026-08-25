create extension if not exists pgcrypto;

create schema if not exists tek_private;
revoke all on schema tek_private from public, anon, authenticated;
grant usage on schema tek_private to postgres, service_role, authenticated;

create table if not exists public.tek_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.tek_tenant_memberships (
  tenant_id uuid not null references public.tek_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.tek_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tek_tenants(id) on delete cascade,
  subject_id text not null check (length(trim(subject_id)) > 0),
  kind text not null default 'photo' check (kind in ('photo', 'document', 'other')),
  file_path text not null unique,
  recorded_at timestamptz not null default now(),
  captured_at timestamptz,
  actor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  check (length(trim(file_path)) > 0)
);

create index if not exists tek_evidence_tenant_subject_recorded_idx
  on public.tek_evidence (tenant_id, subject_id, recorded_at desc);

create index if not exists tek_memberships_user_active_idx
  on public.tek_tenant_memberships (user_id, active)
  where active = true;

create or replace function tek_private.is_tenant_member(target_tenant_id uuid)
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
  );
$$;

revoke all on function tek_private.is_tenant_member(uuid) from public, anon, authenticated;
grant execute on function tek_private.is_tenant_member(uuid) to authenticated;

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
        when 'evidence.read' then membership.role in ('owner', 'admin', 'member')
        when 'evidence.create' then membership.role in ('owner', 'admin')
        when 'evidence.delete' then membership.role in ('owner', 'admin')
        else false
      end
  );
$$;

revoke all on function tek_private.has_tenant_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function tek_private.has_tenant_permission(uuid, text)
  to authenticated;

create or replace function tek_private.object_tenant_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment is null or first_segment = '' then
    return null;
  end if;

  begin
    return first_segment::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

revoke all on function tek_private.object_tenant_id(text) from public, anon, authenticated;
grant execute on function tek_private.object_tenant_id(text) to authenticated;

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

create or replace function public.tek_create_tenant(tenant_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  tenant_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if tenant_name is null or length(trim(tenant_name)) = 0 then
    raise exception 'Tenant name is required';
  end if;

  insert into public.tek_tenants (name, created_by)
  values (trim(tenant_name), current_user_id)
  returning id into tenant_id;

  insert into public.tek_tenant_memberships (tenant_id, user_id, role)
  values (tenant_id, current_user_id, 'owner');

  return tenant_id;
end;
$$;

revoke all on function public.tek_create_tenant(text) from public, anon;
grant execute on function public.tek_create_tenant(text) to authenticated;

alter table public.tek_tenants enable row level security;
alter table public.tek_tenant_memberships enable row level security;
alter table public.tek_evidence enable row level security;

-- Evidence is append-only: metadata may be inserted, read, or explicitly deleted,
-- but it must never be rewritten in place. This revoke is defense in depth in
-- addition to the deliberate absence of an UPDATE policy below.
revoke update on public.tek_evidence from anon, authenticated;

create policy "tenant members can read tenants"
on public.tek_tenants
for select
to authenticated
using (tek_private.is_tenant_member(id));

create policy "users can read their own memberships"
on public.tek_tenant_memberships
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "tenant members can read evidence"
on public.tek_evidence
for select
to authenticated
using (tek_private.has_tenant_permission(tenant_id, 'evidence.read'));

create policy "tenant members can insert evidence"
on public.tek_evidence
for insert
to authenticated
with check (
  tek_private.has_tenant_permission(tenant_id, 'evidence.create')
  and (actor_user_id is null or actor_user_id = (select auth.uid()))
);

create policy "tenant members can delete evidence metadata"
on public.tek_evidence
for delete
to authenticated
using (tek_private.has_tenant_permission(tenant_id, 'evidence.delete'));

insert into storage.buckets (id, name, public)
values ('tenant-evidence-private', 'tenant-evidence-private', false)
on conflict (id) do update set public = false;

create policy "tenant members can upload evidence objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.create')
);

create policy "tenant members can read evidence objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.read')
);

create policy "tenant members can delete evidence objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-evidence-private'
  and tek_private.can_access_object(name, 'evidence.delete')
);
