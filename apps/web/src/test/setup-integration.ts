/**
 * Fixtures for the `integration` Vitest project (`src/**\/*.itest.ts`): real
 * application code (queries/mutations) run against a real local Postgres
 * with a real per-user JWT, so RLS actually applies — unlike fake-supabase.ts
 * (a fake with no concept of policies) or the pgTAP suite (runs as a
 * BYPASSRLS superuser). CI already boots `supabase start` before `supabase
 * test db`; this reuses that same running stack.
 *
 * The URL/keys below are the Supabase CLI's fixed local-dev defaults —
 * printed by `supabase start` on every machine, not a secret — with an env
 * override for anyone who has changed their local `supabase/config.toml`
 * ports. Never point this at a hosted project: makeUser/destroyUser use the
 * secret key to create and delete real auth.users rows.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
// The legacy JWT-based service_role key, not the newer SECRET_KEY — the
// latter doesn't bypass RLS the same way against this project's local
// PostgREST config, and admin.from('allowed_emails') needs to (0005 revoked
// all grants on that table from anon/authenticated).
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const admin: SupabaseClient<Database> = createClient(
  URL,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
  householdId: string;
}

/**
 * Creates a confirmed user with a household-of-one (handle_new_user(), see
 * 0003_households.sql), signed in on a fresh per-user client carrying that
 * user's real JWT — so every query/mutation call made with `.client` is
 * subject to RLS exactly as it would be in production.
 */
export async function makeUser(tag: string): Promise<TestUser> {
  const email = `${tag}-${crypto.randomUUID()}@example.test`;
  const password = 'password123';

  const { error: allowErr } = await admin
    .from('allowed_emails')
    .insert({ email });
  if (allowErr) throw new Error(`allowed_emails insert: ${allowErr.message}`);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);

  const client = createClient<Database>(URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw new Error(`signInWithPassword: ${signInErr.message}`);

  const { data: membership, error: mErr } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', data.user.id)
    .single();
  if (mErr) throw new Error(`household_members lookup: ${mErr.message}`);

  return {
    id: data.user.id,
    email,
    client,
    householdId: membership.household_id,
  };
}

export async function destroyUser(user: TestUser): Promise<void> {
  await admin.auth.admin.deleteUser(user.id);
  await admin.from('allowed_emails').delete().eq('email', user.email);
}
