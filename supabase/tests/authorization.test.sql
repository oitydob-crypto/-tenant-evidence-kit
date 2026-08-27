begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'member@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'peer@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'other-tenant@example.test');

insert into public.tek_tenants (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000001', 'Tenant A', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Tenant B', '00000000-0000-0000-0000-000000000005');

insert into public.tek_tenant_memberships (tenant_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'member'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'owner');

insert into public.tek_evidence (id, tenant_id, subject_id, file_path, actor_user_id)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner-delete', '10000000-0000-0000-0000-000000000001/owner-delete/file', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'admin-delete', '10000000-0000-0000-0000-000000000001/admin-delete/file', '00000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'peer-evidence', '10000000-0000-0000-0000-000000000001/peer/file', '00000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'other-tenant', '10000000-0000-0000-0000-000000000002/other/file', '00000000-0000-0000-0000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
delete from public.tek_evidence where id = '20000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select count(*) from public.tek_evidence where id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'owner can delete evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
delete from public.tek_evidence where id = '20000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select count(*) from public.tek_evidence where id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  'admin can delete evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
delete from public.tek_evidence where id = '20000000-0000-0000-0000-000000000003';
reset role;
select is(
  (select count(*) from public.tek_evidence where id = '20000000-0000-0000-0000-000000000003'),
  1::bigint,
  'member cannot delete evidence created by a tenant peer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.tek_evidence where tenant_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'cross-tenant evidence is not readable'
);
select is(
  (select count(*) from public.tek_evidence where id = '20000000-0000-0000-0000-000000000003'),
  1::bigint,
  'same-tenant evidence remains readable'
);
select lives_ok(
  $$insert into public.tek_evidence (id, tenant_id, subject_id, file_path)
    values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'member-insert', '10000000-0000-0000-0000-000000000001/member/file')$$,
  'active member can still insert evidence'
);
select throws_ok(
  $$insert into public.tek_evidence (id, tenant_id, subject_id, file_path)
    values ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'cross-insert', '10000000-0000-0000-0000-000000000002/cross/file')$$,
  '42501',
  'new row violates row-level security policy for table "tek_evidence"',
  'cross-tenant insert remains blocked'
);
select throws_ok(
  $$update public.tek_evidence set note = 'changed' where id = '20000000-0000-0000-0000-000000000003'$$,
  '42501',
  'permission denied for table tek_evidence',
  'same-tenant update is blocked'
);
select throws_ok(
  $$update public.tek_evidence set note = 'changed' where id = '20000000-0000-0000-0000-000000000004'$$,
  '42501',
  'permission denied for table tek_evidence',
  'cross-tenant update is blocked'
);
delete from public.tek_evidence where id = '20000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select count(*) from public.tek_evidence where id = '20000000-0000-0000-0000-000000000004'),
  1::bigint,
  'cross-tenant delete is blocked'
);

select throws_ok(
  $$insert into public.tek_evidence (id, tenant_id, subject_id, file_path)
    values ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'mismatched-path', '10000000-0000-0000-0000-000000000002/mismatched-path/20000000-0000-0000-0000-000000000007-file')$$,
  '23514',
  null,
  'evidence path tenant must match metadata tenant'
);

select * from finish();
rollback;
