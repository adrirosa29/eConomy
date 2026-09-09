import { createClient } from "@supabase/supabase-js";

// The values below come from your Supabase project: Project Settings > API.
// The "anon" key is meant to be public/client-side — it is safe to commit.
// Real security comes from the Row Level Security policies on your tables
// (see supabase-schema.sql), not from keeping this key secret.
const SUPABASE_URL = "https://nmegokssvfftatovakdx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6uRy2N9iamvkjfnncXrFpw_evspJMXF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
