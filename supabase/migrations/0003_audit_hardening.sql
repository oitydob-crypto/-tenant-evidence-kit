-- Tenant Evidence Kit 0.2.0 audit hardening.
-- The first object-path segment is security-relevant: it must be the same
-- tenant UUID stored in the metadata row. This constraint is intentionally
-- validated against existing data so an installation cannot silently retain
-- cross-tenant metadata pointers.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tek_evidence_file_path_tenant_match'
      and conrelid = 'public.tek_evidence'::regclass
  ) then
    alter table public.tek_evidence
      add constraint tek_evidence_file_path_tenant_match
      check (
        tek_private.object_tenant_id(file_path) is not distinct from tenant_id
      );
  end if;
end;
$$;

