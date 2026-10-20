-- Career Connect schema. Every row belongs to one user (user_id = auth.uid()).
-- The MCP server queries with the caller's own OAuth access token, so these
-- RLS policies are the isolation boundary between users.

-- profile + settings: one row per user ---------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- contacts -------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  title text,
  company text,
  industry text,
  contact_type text check (contact_type in (
    'Hiring manager', 'HR or recruiter', 'Alum', 'Industry professional', 'Mentor',
    'Former colleague', 'Professor', 'Peer or classmate', 'Other')),
  source text,
  -- TODO(phase 1): store email, phone and notes encrypted at the application layer.
  email text,
  phone text,
  linkedin_url text,
  status text not null default 'Not contacted' check (status in (
    'Not contacted', 'Reached out', 'Meeting scheduled', 'Met', 'Follow-up due', 'Dormant')),
  priority text check (priority in ('A', 'B', 'C')),
  goal text,
  nurture_ideas text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_user_id_idx on public.contacts (user_id);

-- interactions: one row per outreach, meeting, thank-you, reply ---------------
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in (
    'outreach', 'follow_up', 'meeting', 'thank_you', 'reply_received', 'nurture')),
  date date not null,
  note text,
  created_at timestamptz not null default now()
);
create index interactions_user_id_idx on public.interactions (user_id);
create index interactions_contact_id_idx on public.interactions (contact_id);

-- An interaction must point at a contact owned by the same user.
create function public.interaction_contact_owner_matches()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.user_id = new.user_id
  ) then
    raise exception 'contact % does not belong to this user', new.contact_id;
  end if;
  return new;
end;
$$;

create trigger interactions_contact_owner
  before insert or update on public.interactions
  for each row execute function public.interaction_contact_owner_matches();

-- audit log: append-only for users ------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  detail text
);
create index audit_log_user_id_idx on public.audit_log (user_id);

-- one-time export links: only a hash of the token is stored --------------------
create table public.export_tokens (
  token_hash text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create index export_tokens_user_id_idx on public.export_tokens (user_id);

-- updated_at ----------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Row-level security -------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.interactions enable row level security;
alter table public.audit_log enable row level security;
alter table public.export_tokens enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own profile: create" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own profile: change" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own contacts: read" on public.contacts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own contacts: create" on public.contacts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own contacts: change" on public.contacts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own contacts: delete" on public.contacts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "own interactions: read" on public.interactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own interactions: create" on public.interactions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own interactions: delete" on public.interactions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "own audit log: read" on public.audit_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own audit log: append" on public.audit_log for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Users may create their own export tokens but never read them back; the
-- download route redeems them with the server-only secret key.
create policy "own export tokens: create" on public.export_tokens for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Data API access (new tables are not exposed automatically) ------------------
revoke all on public.profiles, public.contacts, public.interactions, public.audit_log, public.export_tokens
  from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, delete on public.interactions to authenticated;
grant select, insert on public.audit_log to authenticated;
grant insert on public.export_tokens to authenticated;

revoke execute on function public.interaction_contact_owner_matches() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
