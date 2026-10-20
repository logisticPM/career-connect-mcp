-- Beta sign-up gate: an account can only be created with a valid invite code.
-- Enforced by Supabase Auth's "Before User Created" hook, so calling the public
-- sign-up API directly cannot bypass it. Codes are stored as bcrypt hashes in a
-- schema the Data API never exposes.
--
-- Add a code (run in the SQL editor; the plain code is never stored):
--   insert into private.invite_codes (code_hash, label)
--   values (extensions.crypt('YOUR-CODE', extensions.gen_salt('bf')), 'MBA beta');
-- Retire it:
--   update private.invite_codes set revoked_at = now() where label = 'MBA beta';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.invite_codes (
  code_hash text primary key,
  label text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table private.invite_codes enable row level security;
revoke all on private.invite_codes from public, anon, authenticated;

-- security definer: the hook runs as supabase_auth_admin, which cannot use the
-- extensions schema (pgcrypto) or private. The function only reads invite
-- codes, has a fixed search_path, and only supabase_auth_admin may execute it.
create function public.hook_require_invite_code(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  code text := nullif(trim(event -> 'user' -> 'user_metadata' ->> 'invite_code'), '');
begin
  if code is not null and exists (
    select 1
    from private.invite_codes c
    where c.revoked_at is null
      and c.code_hash = extensions.crypt(code, c.code_hash)
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'A valid invite code is required to create an account.'
    )
  );
end;
$$;

-- Only Supabase Auth may run the hook; nobody but the owner reads the codes.
grant execute on function public.hook_require_invite_code(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite_code(jsonb) from public, anon, authenticated;
