import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

// Applies the real migrations to an in-process Postgres with a minimal stand-in
// for Supabase's auth schema, then checks that RLS isolates users.

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role supabase_auth_admin nologin;
  create schema extensions;
  create extension pgcrypto schema extensions;
  revoke all on schema extensions from public;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

let db: PGlite;

/** Runs `sql` as the authenticated role with the given user's JWT subject. */
async function as<T>(userId: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true);`);
    return tx.query<T>(sql, params);
  });
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}');`);
});

describe("row-level security", () => {
  it("lets a user write and read their own contacts, with user_id filled from the token", async () => {
    await as(ALICE, `insert into contacts (name, company) values ('Sam Lee', 'Acme')`);
    const rows = await as<{ name: string; user_id: string }>(ALICE, "select name, user_id from contacts");
    expect(rows.rows).toEqual([{ name: "Sam Lee", user_id: ALICE }]);
  });

  it("hides one user's contacts from another", async () => {
    const rows = await as(BOB, "select * from contacts");
    expect(rows.rows).toEqual([]);
  });

  it("blocks inserting rows on behalf of another user", async () => {
    await expect(as(BOB, `insert into contacts (user_id, name) values ('${ALICE}', 'Spoof')`)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("blocks moving a row to another user, and silently ignores updates to others' rows", async () => {
    await expect(as(ALICE, `update contacts set user_id = '${BOB}'`)).rejects.toThrow(/row-level security/);
    const res = await as(BOB, `update contacts set name = 'Hacked'`);
    expect(res.affectedRows).toBe(0);
  });

  it("logs interactions on your own contacts and keeps profile updates working", async () => {
    const { rows } = await as<{ id: string }>(ALICE, "select id from contacts");
    await as(ALICE, `insert into interactions (contact_id, kind, date) values ($1, 'outreach', '2026-10-20')`, [rows[0].id]);
    expect((await as(ALICE, "select kind from interactions")).rows).toEqual([{ kind: "outreach" }]);

    await as(ALICE, `insert into profiles (profile) values ('{"background": "Logistics"}')`);
    await as(ALICE, `update profiles set profile = '{"background": "Product"}'`);
    expect((await as(ALICE, "select profile->>'background' as b from profiles")).rows).toEqual([{ b: "Product" }]);
  });

  it("rejects an interaction that points at someone else's contact", async () => {
    const { rows } = await as<{ id: string }>(ALICE, "select id from contacts");
    await expect(
      as(BOB, `insert into interactions (contact_id, kind, date) values ($1, 'outreach', '2026-10-20')`, [rows[0].id]),
    ).rejects.toThrow(/does not belong/);
  });

  it("enforces the allowed values", async () => {
    await expect(as(ALICE, `insert into contacts (name, status) values ('X', 'Ghosted')`)).rejects.toThrow(/check/);
  });

  it("keeps the audit log append-only", async () => {
    await as(ALICE, `insert into audit_log (action) values ('test')`);
    await expect(as(ALICE, `delete from audit_log`)).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, `update audit_log set action = 'x'`)).rejects.toThrow(/permission denied/);
  });

  it("gives anonymous callers nothing", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        return tx.query("select * from contacts");
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("invite code sign-up hook", () => {
  /** Calls the hook the way Supabase Auth does: as supabase_auth_admin. */
  async function hook(inviteCode?: string) {
    const event = { metadata: { name: "before-user-created" }, user: { email: "new@example.com", user_metadata: inviteCode === undefined ? {} : { invite_code: inviteCode } } };
    return db.transaction(async (tx) => {
      await tx.exec("set local role supabase_auth_admin");
      const { rows } = await tx.query<{ r: Record<string, unknown> }>("select public.hook_require_invite_code($1) as r", [JSON.stringify(event)]);
      return rows[0].r;
    });
  }

  beforeAll(async () => {
    await db.exec(`
      insert into private.invite_codes (code_hash, label) values
        (extensions.crypt('BETA-OK', extensions.gen_salt('bf')), 'current'),
        (extensions.crypt('BETA-OLD', extensions.gen_salt('bf')), 'retired');
      update private.invite_codes set revoked_at = now() where label = 'retired';
    `);
  });

  it("allows sign-up with a valid code, ignoring surrounding spaces", async () => {
    expect(await hook("BETA-OK")).toEqual({});
    expect(await hook("  BETA-OK ")).toEqual({});
  });

  it("rejects a missing, wrong or retired code with a 403", async () => {
    for (const code of [undefined, "", "beta-ok", "WRONG", "BETA-OLD"]) {
      expect(await hook(code)).toMatchObject({ error: { http_code: 403 } });
    }
  });

  it("stores only hashes, never the plain code", async () => {
    const { rows } = await db.query<{ code_hash: string }>("select code_hash from private.invite_codes");
    expect(rows.every((r) => r.code_hash.startsWith("$2") && !r.code_hash.includes("BETA"))).toBe(true);
  });

  it("is not callable or readable by app users", async () => {
    await expect(as(ALICE, `select public.hook_require_invite_code('{}')`)).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, "select * from private.invite_codes")).rejects.toThrow(/permission denied/);
  });
});
