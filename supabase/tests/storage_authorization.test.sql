begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000011', 'storage-owner@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'storage-member@example.test'),
  ('00000000-0000-0000-0000-000000000013', 'storage-other@example.test');

insert into public.tek_tenants (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000011', 'Storage Tenant A', '00000000-0000-0000-0000-000000000011'),
  ('10000000-0000-0000-0000-000000000012', 'Storage Tenant B', '00000000-0000-0000-0000-000000000013');

insert into public.tek_tenant_memberships (tenant_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'owner'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'member'),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'tenant-evidence-private',
      '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt',
      '00000000-0000-0000-0000-000000000011',
      '{"mimetype":"text/plain"}'::jsonb
    )$$,
  'same-tenant owner can upload an evidence object'
);
select is(
  (select count(*) from storage.objects where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt'),
  1::bigint,
  'same-tenant object is readable'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select is(
  (select count(*) from storage.objects where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt'),
  1::bigint,
  'same-tenant member can read an evidence object'
);
select is(
  (select count(*) from storage.objects where name = '10000000-0000-0000-0000-000000000012/other-subject/20000000-0000-0000-0000-000000000012-file.txt'),
  0::bigint,
  'member cannot read another tenant object'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'tenant-evidence-private',
      '10000000-0000-0000-0000-000000000012/other-subject/20000000-0000-0000-0000-000000000012-file.txt',
      '00000000-0000-0000-0000-000000000012',
      '{}'::jsonb
    )$$,
  '42501',
  null,
  'cross-tenant object upload is blocked'
);
select lives_ok(
  $$delete from storage.objects
    where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt'$$,
  'same-tenant member delete is evaluated without a policy error'
);
reset role;
select is(
  (select count(*) from storage.objects where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt'),
  1::bigint,
  'ordinary member cannot delete an evidence object'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
delete from storage.objects
  where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt';
reset role;
select is(
  (select count(*) from storage.objects where name = '10000000-0000-0000-0000-000000000011/storage-subject/20000000-0000-0000-0000-000000000011-file.txt'),
  0::bigint,
  'owner can delete an evidence object'
);

select is(
  (select public from storage.buckets where id = 'tenant-evidence-private'),
  false,
  'reference evidence bucket is private'
);

select * from finish();
rollback;

