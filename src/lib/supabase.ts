import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (typeof process !== "undefined" ? process.env.VITE_SUPABASE_URL : undefined);

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (typeof process !== "undefined" ? process.env.VITE_SUPABASE_ANON_KEY : undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. " +
      "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file (local dev) " +
      "or to Netlify → Site → Environment variables (production).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
